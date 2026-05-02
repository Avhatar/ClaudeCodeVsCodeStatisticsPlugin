import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const HOOK_FILENAME = 'claude-usage-monitor-hook.js';
export const HOOK_MARKER = 'claude-usage-monitor-hook';

export interface HookStatus {
  scriptInstalled: boolean;
  scriptPath: string;
  registered: boolean;
  settingsPath: string;
  externalStopHookCount: number;
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

function readSettings(): SettingsShape {
  const p = settingsPath();
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function writeSettings(s: SettingsShape): void {
  const p = settingsPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n', 'utf8');
}

export function getHookStatus(): HookStatus {
  const scriptPath = hookScriptPath();
  const scriptInstalled = fs.existsSync(scriptPath);
  const settings = readSettings();
  const stopHooks = settings.hooks?.Stop ?? [];
  let registered = false;
  let externalStopHookCount = 0;
  for (const entry of stopHooks) {
    const ours = entry.hooks?.some(h => typeof h.command === 'string' && h.command.includes(HOOK_MARKER));
    if (ours) registered = true;
    else externalStopHookCount += 1;
  }
  return {
    scriptInstalled,
    scriptPath,
    registered,
    settingsPath: settingsPath(),
    externalStopHookCount,
  };
}

export function installHook(bundledScriptPath: string): { changed: boolean; status: HookStatus } {
  const scriptDest = hookScriptPath();
  const dir = path.dirname(scriptDest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let changed = false;

  const newContent = fs.readFileSync(bundledScriptPath, 'utf8');
  const existingContent = fs.existsSync(scriptDest) ? fs.readFileSync(scriptDest, 'utf8') : null;
  if (existingContent !== newContent) {
    fs.writeFileSync(scriptDest, newContent, 'utf8');
    changed = true;
  }

  const settings = readSettings();
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];

  const cmd = `node "${scriptDest.replace(/\\/g, '/')}"`;

  const alreadyRegistered = settings.hooks.Stop.some(entry =>
    entry.hooks?.some(h => typeof h.command === 'string' && h.command.includes(HOOK_MARKER))
  );
  if (!alreadyRegistered) {
    settings.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
    writeSettings(settings);
    changed = true;
  }

  return { changed, status: getHookStatus() };
}

export function uninstallHook(removeScript: boolean): { changed: boolean; status: HookStatus } {
  let changed = false;
  const settings = readSettings();
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
