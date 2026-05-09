import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';

export const HOOK_FILENAME = 'claude-usage-monitor-hook.js';
export const HOOK_MARKER = 'claude-usage-monitor-hook';

export interface HookStatus {
  scriptInstalled: boolean;
  scriptPath: string;
  registered: boolean;
  settingsPath: string;
  externalStopHookCount: number;
  installedVersion: string | null;
}

export interface NodeInfo {
  path: string;     // absolute path resolved via `where node` / `which node`
  version: string;  // e.g. "v20.11.0"
}

// Structured failure modes for installHook(). The sidebar renders a different
// inline diagnostic per code so the user gets actionable text instead of a
// generic toast that disappears.
export type InstallError =
  | { code: 'no-node' }
  | { code: 'bundled-missing'; detail: string }
  | { code: 'script-copy'; detail: string }
  | { code: 'settings-read'; detail: string }
  | { code: 'settings-write'; detail: string };

export interface InstallResult {
  ok: boolean;
  changed: boolean;
  status: HookStatus;
  error?: InstallError;
  nodePath?: string;
}

const VERSION_RE = /claude-usage-monitor-hook v=([\d.]+)/;

export function readHookVersion(scriptPath: string): string | null {
  if (!fs.existsSync(scriptPath)) return null;
  try {
    const head = fs.readFileSync(scriptPath, 'utf8').slice(0, 800);
    const m = VERSION_RE.exec(head);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

interface SettingsHookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}
interface SettingsShape {
  hooks?: { Stop?: SettingsHookEntry[]; [key: string]: SettingsHookEntry[] | undefined };
  [key: string]: unknown;
}

function settingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function hookScriptPath(): string {
  return path.join(os.homedir(), '.claude', 'hooks', HOOK_FILENAME);
}

// Resolve an absolute path to `node` rather than relying on bare `node` in
// settings.json. Claude Code spawns Stop hooks with its own shell environment,
// whose PATH is not guaranteed to match VS Code's — especially on Windows where
// `node` may be installed by a per-user installer that only writes to the user
// PATH that the CC process never inherited. With an absolute path the hook
// runs regardless of the spawning shell's PATH.
//
// Returns null when node truly isn't on the system. The sidebar treats this as
// "Install Node.js" prompt, not as a generic install failure.
export function findNodeExecutable(): NodeInfo | null {
  const isWin = process.platform === 'win32';
  const locator = isWin ? 'where' : 'which';
  const lookup = spawnSync(locator, ['node'], { encoding: 'utf8', timeout: 2000, shell: false });
  if (lookup.status !== 0 || !lookup.stdout) return null;
  const firstLine = lookup.stdout.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0);
  if (!firstLine) return null;

  const ver = spawnSync(firstLine, ['--version'], { encoding: 'utf8', timeout: 2000, shell: false });
  if (ver.status !== 0 || !ver.stdout) return null;
  return { path: firstLine, version: ver.stdout.trim() };
}

type SettingsReadResult =
  | { kind: 'ok'; settings: SettingsShape }
  | { kind: 'parse-error'; detail: string };

function readSettings(): SettingsReadResult {
  const p = settingsPath();
  if (!fs.existsSync(p)) return { kind: 'ok', settings: {} };
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'parse-error', detail: `read failed: ${msg}` };
  }
  if (!raw.trim()) return { kind: 'ok', settings: {} };
  try {
    return { kind: 'ok', settings: JSON.parse(raw) as SettingsShape };
  } catch (err) {
    // Don't silently coerce to {} — that would nuke any pre-existing settings
    // (permissions, env, hooks from other tools) the moment the user clicked
    // Install hook. Surface the parse error and let the caller refuse to
    // overwrite the file.
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'parse-error', detail: `parse failed: ${msg}` };
  }
}

function writeSettings(s: SettingsShape): void {
  const p = settingsPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n', 'utf8');
}

function statusFromSettings(result: SettingsReadResult): { registered: boolean; externalStopHookCount: number } {
  if (result.kind !== 'ok') return { registered: false, externalStopHookCount: 0 };
  const stopHooks = result.settings.hooks?.Stop ?? [];
  let registered = false;
  let externalStopHookCount = 0;
  for (const entry of stopHooks) {
    const ours = entry.hooks?.some(h => typeof h.command === 'string' && h.command.includes(HOOK_MARKER));
    if (ours) registered = true;
    else externalStopHookCount += 1;
  }
  return { registered, externalStopHookCount };
}

export function getHookStatus(): HookStatus {
  const scriptPath = hookScriptPath();
  const scriptInstalled = fs.existsSync(scriptPath);
  const settings = readSettings();
  const { registered, externalStopHookCount } = statusFromSettings(settings);
  return {
    scriptInstalled,
    scriptPath,
    registered,
    settingsPath: settingsPath(),
    externalStopHookCount,
    installedVersion: scriptInstalled ? readHookVersion(scriptPath) : null,
  };
}

export function installHook(bundledScriptPath: string): InstallResult {
  // Step 0: bundled file present.
  if (!fs.existsSync(bundledScriptPath)) {
    return { ok: false, changed: false, status: getHookStatus(), error: { code: 'bundled-missing', detail: bundledScriptPath } };
  }

  // Step 1: must have node — the hook is a Node.js script. Without it the
  // Stop hook silently fails inside Claude Code (no logs surfaced anywhere)
  // and the user is left waiting forever on "Hook installed". Refuse to write
  // settings.json so we don't leave a dead command behind.
  const node = findNodeExecutable();
  if (!node) {
    return { ok: false, changed: false, status: getHookStatus(), error: { code: 'no-node' } };
  }

  let changed = false;
  const scriptDest = hookScriptPath();
  const dir = path.dirname(scriptDest);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, changed: false, status: getHookStatus(), error: { code: 'script-copy', detail: `mkdir ${dir}: ${msg}` } };
    }
  }

  let newContent: string;
  try { newContent = fs.readFileSync(bundledScriptPath, 'utf8'); }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, changed: false, status: getHookStatus(), error: { code: 'script-copy', detail: `read bundled: ${msg}` } };
  }

  let existingContent: string | null = null;
  if (fs.existsSync(scriptDest)) {
    try { existingContent = fs.readFileSync(scriptDest, 'utf8'); }
    catch { existingContent = null; }
  }
  if (existingContent !== newContent) {
    try { fs.writeFileSync(scriptDest, newContent, 'utf8'); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, changed: false, status: getHookStatus(), error: { code: 'script-copy', detail: `write ${scriptDest}: ${msg}` } };
    }
    changed = true;
  }

  const settingsResult = readSettings();
  if (settingsResult.kind === 'parse-error') {
    return { ok: false, changed, status: getHookStatus(), error: { code: 'settings-read', detail: settingsResult.detail } };
  }
  const settings = settingsResult.settings;

  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];

  // Quote both node path and script path. cmd.exe / sh both treat the first
  // token of a quoted command line as the executable; spaces in either path
  // would otherwise split the command at the wrong place.
  const cmd = `"${node.path.replace(/\\/g, '/')}" "${scriptDest.replace(/\\/g, '/')}"`;

  const existingIdx = settings.hooks.Stop.findIndex(entry =>
    entry.hooks?.some(h => typeof h.command === 'string' && h.command.includes(HOOK_MARKER))
  );
  if (existingIdx === -1) {
    settings.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
    try { writeSettings(settings); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, changed, status: getHookStatus(), error: { code: 'settings-write', detail: msg } };
    }
    changed = true;
  } else {
    // An entry referring to our hook already exists. If the recorded command
    // doesn't match what we'd write now (e.g. it still says bare `node`, or
    // points at an old script path), update it in place — that's how users
    // upgrading from 0.66.x get the absolute-node-path fix without having to
    // remove and reinstall.
    const entry = settings.hooks.Stop[existingIdx];
    const ourHook = entry.hooks?.find(h => typeof h.command === 'string' && h.command.includes(HOOK_MARKER));
    if (ourHook && ourHook.command !== cmd) {
      ourHook.command = cmd;
      try { writeSettings(settings); }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, changed, status: getHookStatus(), error: { code: 'settings-write', detail: msg } };
      }
      changed = true;
    }
  }

  return { ok: true, changed, status: getHookStatus(), nodePath: node.path };
}

export function uninstallHook(removeScript: boolean): { changed: boolean; status: HookStatus } {
  let changed = false;
  const settingsResult = readSettings();
  if (settingsResult.kind === 'parse-error') {
    // Refuse to touch a malformed settings.json. The user has bigger problems
    // than our hook entry; surfacing it here keeps us from making things worse.
    return { changed: false, status: getHookStatus() };
  }
  const settings = settingsResult.settings;
  const stop = settings.hooks?.Stop;
  if (Array.isArray(stop)) {
    const before = stop.length;
    const filtered = stop.filter(entry =>
      !entry.hooks?.some(h => typeof h.command === 'string' && h.command.includes(HOOK_MARKER))
    );
    if (filtered.length !== before) {
      if (filtered.length === 0) {
        delete settings.hooks!.Stop;
        if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
      } else {
        settings.hooks!.Stop = filtered;
      }
      writeSettings(settings);
      changed = true;
    }
  }

  if (removeScript) {
    const sp = hookScriptPath();
    if (fs.existsSync(sp)) {
      try { fs.unlinkSync(sp); changed = true; } catch { /* ignore */ }
    }
  }

  return { changed, status: getHookStatus() };
}
