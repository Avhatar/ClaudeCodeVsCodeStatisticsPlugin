import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_LOG_PATH, readAll, readLatest, ParsedSample } from './logSource';
import { renderHtml, ViewState } from './webview';
import { renderDailySummaryMarkdownFromEntries } from './history';
import { prepareChartData } from './chart';
import { renderChartHtml } from './chartView';
import { renderTokensHtml } from './tokensView';
import { getHookStatus, installHook, uninstallHook, readHookVersion, HOOK_FILENAME, findNodeExecutable, NodeInfo, InstallError } from './hookSetup';
import { ChartSettings, DEFAULT_CHART_SETTINGS, TokensChartSettings, DEFAULT_TOKENS_CHART_SETTINGS } from './chartLogic';
import { loadPricing, PricingTable } from './pricing';

const SETUP_PROMPT_DECLINED_KEY = 'claudeUsage.setupPromptDeclined';
const CHART_SETTINGS_KEY = 'claudeUsage.chartSettings';
const TOKENS_SETTINGS_KEY = 'claudeUsage.tokensChartSettings';

let extensionContext: vscode.ExtensionContext;
let currentSamples: ParsedSample[] = [];
let hookOutdatedInfo: { installed: string | null; bundled: string } | null = null;
let updatePromptShownThisSession = false;
let pricingTable: PricingTable | null = null;
let settingsOpen = false; // sidebar Settings dropdown — kept in extension memory so toggling an option doesn't collapse the section
// Cached node detection result. `null` means "not checked yet" (forces a probe
// on first use); `false` means we ran the probe and node wasn't found. We
// re-probe whenever the user clicks Recheck or after a successful install,
// not on every refresh — spawning child processes per-render would jitter the
// sidebar on slow systems.
let cachedNodeInfo: NodeInfo | null | false = null;
// Surface of the most recent installHook() failure, surfaced inline in the
// sidebar instead of a transient toast. Cleared on successful install or on
// explicit Recheck.
let lastInstallError: InstallError | null = null;
function getSettings(): ChartSettings {
  const saved = extensionContext?.globalState.get<ChartSettings>(CHART_SETTINGS_KEY);
  return saved ? { ...DEFAULT_CHART_SETTINGS, ...saved } : DEFAULT_CHART_SETTINGS;
}
function getTokensSettings(): TokensChartSettings {
  const saved = extensionContext?.globalState.get<TokensChartSettings>(TOKENS_SETTINGS_KEY);
  return saved ? { ...DEFAULT_TOKENS_CHART_SETTINGS, ...saved } : DEFAULT_TOKENS_CHART_SETTINGS;
}

function toggleSetting(key: 'showUsdSpent' | 'vscodeSkin' | 'ignoreBuggedApiData') {
  const next = { ...getSettings(), [key]: !getSettings()[key] };
  extensionContext.globalState.update(CHART_SETTINGS_KEY, next);
  log(`toggleSetting: ${key} -> ${next[key]}`);
  // ignoreBuggedApiData affects how the parser interprets the log, so the
  // currentSamples cache and dependent views need a full refresh.
  if (key === 'ignoreBuggedApiData') {
    refresh();
  } else {
    panelProvider.update(currentState);
  }
  // Push fresh ChartData (carrying vscodeSkin / ignoreBuggedApiData) to any
  // open panel so they re-theme / re-filter without needing user input on
  // the panel itself.
  if (chartPanel) pushChartData();
  if (tokensPanel) pushTokensData();
}

let statusItem: vscode.StatusBarItem;
let panelProvider: UsagePanelProvider;
let logChannel: vscode.OutputChannel;
let watcher: fs.FSWatcher | undefined;
let debounce: NodeJS.Timeout | undefined;

let currentState: ViewState = { stats: null, error: null, lastFetchAt: null, hookOutdated: null, hookRegistered: false, nodeInfo: null, lastInstallError: null };

function getNodeInfo(forceRecheck = false): NodeInfo | false {
  if (forceRecheck || cachedNodeInfo === null) {
    const found = findNodeExecutable();
    cachedNodeInfo = found ?? false;
    log(`node detection: ${found ? `${found.version} at ${found.path}` : 'NOT FOUND'}`);
  }
  return cachedNodeInfo;
}

function log(msg: string) {
  if (!logChannel) return;
  logChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

function getLogPath(): string {
  const cfg = vscode.workspace.getConfiguration('claudeUsage').get<string>('logPath');
  return cfg && cfg.trim() ? cfg : DEFAULT_LOG_PATH;
}

function getReadOpts() {
  return {
    ignoreBuggedApiData: getSettings().ignoreBuggedApiData,
  };
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  logChannel = vscode.window.createOutputChannel('Claude Usage Monitor');
  context.subscriptions.push(logChannel);
  log(`activate(): version=${context.extension.packageJSON.version}`);
  log(`log source = ${getLogPath()}`);

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'claudeUsage.refresh';
  statusItem.tooltip = 'Claude Code usage — click to refresh';
  context.subscriptions.push(statusItem);

  panelProvider = new UsagePanelProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeUsage.panel', panelProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeUsage.refresh', () => refresh()),
    vscode.commands.registerCommand('claudeUsage.showDailySummary', () => showDailySummary()),
    vscode.commands.registerCommand('claudeUsage.toggleShowUsdSpent', () => toggleSetting('showUsdSpent')),
    vscode.commands.registerCommand('claudeUsage.toggleVscodeSkin',  () => toggleSetting('vscodeSkin')),
    vscode.commands.registerCommand('claudeUsage.toggleIgnoreBuggedApiData', () => toggleSetting('ignoreBuggedApiData')),
    vscode.commands.registerCommand('claudeUsage.toggleSettingsOpen', () => { settingsOpen = !settingsOpen; panelProvider.update(currentState); }),
    vscode.commands.registerCommand('claudeUsage.showChart', () => showChart()),
    vscode.commands.registerCommand('claudeUsage.showTokens', () => showTokens()),
    vscode.commands.registerCommand('claudeUsage.openLogFile', () => openLogFile()),
    vscode.commands.registerCommand('claudeUsage.openPricingFile', () => openPricingFile()),
    vscode.commands.registerCommand('claudeUsage.showLog', () => logChannel.show(true)),
    vscode.commands.registerCommand('claudeUsage.setupHook', () => doSetupHook(context)),
    vscode.commands.registerCommand('claudeUsage.updateHook', () => doUpdateHook()),
    vscode.commands.registerCommand('claudeUsage.removeHook', () => doRemoveHook()),
    vscode.commands.registerCommand('claudeUsage.showHookStatus', () => showHookStatus()),
    vscode.commands.registerCommand('claudeUsage.showHookInvocationLog', () => showHookInvocationLog()),
    vscode.commands.registerCommand('claudeUsage.openNodeJsInstall', () => openNodeJsInstall()),
    vscode.commands.registerCommand('claudeUsage.checkNode', () => checkNodeAndRefresh()),
    vscode.commands.registerCommand('claudeUsage.openSettingsJson', () => openSettingsJson()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeUsage.logPath')) {
        startWatcher();
        refresh();
      }
    })
  );

  pricingTable = loadPricing(context.extensionPath);
  log(`pricing: ${pricingTable
    ? Object.keys(pricingTable.models).length + ' models, updated=' + (pricingTable._updated ?? 'unknown')
    : 'NOT LOADED (cost calc will be unavailable)'}`);

  startWatcher();
  refresh();
  computeHookOutdated(context);
  maybePromptSetup(context);
  maybePromptUpdate();
}

function bundledHookPath(): string {
  return path.join(extensionContext.extensionPath, 'media', 'hooks', HOOK_FILENAME);
}

function computeHookOutdated(_context: vscode.ExtensionContext) {
  const status = getHookStatus();
  const bundled = readHookVersion(bundledHookPath());
  if (!bundled) { hookOutdatedInfo = null; return; }
  if (status.scriptInstalled && status.installedVersion !== bundled) {
    hookOutdatedInfo = { installed: status.installedVersion, bundled };
    log(`hook outdated: installed=${status.installedVersion ?? 'unknown'} bundled=${bundled}`);
  } else {
    hookOutdatedInfo = null;
  }
}

async function maybePromptUpdate() {
  if (!hookOutdatedInfo) return;
  if (updatePromptShownThisSession) return;
  updatePromptShownThisSession = true;
  const { installed, bundled } = hookOutdatedInfo;
  const choice = await vscode.window.showInformationMessage(
    `Claude Usage Monitor: hook update available (${installed ?? 'unknown'} → ${bundled}).`,
    'Update hook',
    'Later'
  );
  if (choice === 'Update hook') {
    await doUpdateHook();
  }
}

async function doUpdateHook() {
  const bundled = bundledHookPath();
  const result = installHook(bundled);
  log(`updateHook: ok=${result.ok}, changed=${result.changed}, version=${result.status.installedVersion}` + (result.error ? `, error=${result.error.code}` : ''));

  if (!result.ok && result.error) {
    // Same inline-diagnostic flow as install. The update path can hit the
    // same failure modes (no-node, settings-write, etc.) and the user
    // benefits from seeing them in the sidebar instead of a toast.
    lastInstallError = result.error;
    if (result.error.code === 'no-node') cachedNodeInfo = false;
    refresh();
    return;
  }

  lastInstallError = null;
  vscode.window.showInformationMessage(
    result.changed
      ? `Claude Usage: hook updated to ${result.status.installedVersion}. New turns will be logged with the new format.`
      : 'Claude Usage: hook already up to date.'
  );
  computeHookOutdated(extensionContext);
  // currentState.hookOutdated is a snapshot from the last refresh() — sync
  // it now so the sidebar banner disappears on this re-render instead of
  // lingering until the next log-driven refresh. Without this, users see the
  // banner stay put after clicking "Update hook" and click again repeatedly.
  currentState = { ...currentState, hookOutdated: hookOutdatedInfo, lastInstallError };
  panelProvider.update(currentState);
}

async function maybePromptSetup(context: vscode.ExtensionContext) {
  const declined = context.globalState.get<boolean>(SETUP_PROMPT_DECLINED_KEY);
  if (declined) return;

  const status = getHookStatus();
  if (status.registered) return;

  const logExists = fs.existsSync(getLogPath());
  if (logExists && status.externalStopHookCount > 0) {
    log(`maybePromptSetup: external Stop hook(s) present and log exists; not prompting`);
    return;
  }

  log(`maybePromptSetup: hook not registered; prompting`);

  // Different prompt depending on whether Node.js is even available. Showing
  // "Install hook" first when node isn't present sends the user down a dead-
  // end path: install would refuse, the sidebar would show the no-node panel,
  // and they'd be back where they started. Cut to the chase.
  const node = getNodeInfo();
  if (node === false) {
    const choice = await vscode.window.showInformationMessage(
      'Claude Usage Monitor needs Node.js — the Stop hook is a Node script. Install Node.js and the plugin will guide you through hook setup.',
      'Install Node.js',
      'I have Node, retry detection',
      "Don't ask again"
    );
    if (choice === 'Install Node.js') {
      openNodeJsInstall();
    } else if (choice === 'I have Node, retry detection') {
      checkNodeAndRefresh();
    } else if (choice === "Don't ask again") {
      context.globalState.update(SETUP_PROMPT_DECLINED_KEY, true);
    }
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    'Claude Usage Monitor: install Stop hook so the plugin can track API usage?',
    'Install hook',
    'Open settings.json',
    "Don't ask again"
  );
  if (choice === 'Install hook') {
    await doSetupHook(context);
  } else if (choice === 'Open settings.json') {
    openSettingsJson();
  } else if (choice === "Don't ask again") {
    context.globalState.update(SETUP_PROMPT_DECLINED_KEY, true);
  }
}

function openNodeJsInstall() {
  vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org/'));
}

async function checkNodeAndRefresh() {
  const before = cachedNodeInfo;
  const found = getNodeInfo(/* forceRecheck */ true);
  if (found && typeof found === 'object') {
    // Successful detection clears any prior no-node sticky error so the
    // sidebar swings back to the regular install/wait flow on next render.
    if (lastInstallError && lastInstallError.code === 'no-node') lastInstallError = null;
    if (before === false || before === null) {
      vscode.window.showInformationMessage(`Claude Usage: Node ${found.version} detected. You can install the hook now.`);
    }
  } else {
    vscode.window.showWarningMessage(
      'Claude Usage: still cannot find Node.js on PATH. After installing, you may need to reload VS Code (Developer: Reload Window) so the new PATH is picked up.'
    );
  }
  refresh();
}

async function openSettingsJson() {
  const sp = path.join(require('os').homedir(), '.claude', 'settings.json');
  if (!fs.existsSync(sp)) {
    vscode.window.showInformationMessage(`Claude Usage: settings.json not found at ${sp}.`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(sp);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function doSetupHook(context: vscode.ExtensionContext) {
  const bundled = path.join(context.extensionPath, 'media', 'hooks', HOOK_FILENAME);
  const result = installHook(bundled);
  log(`setupHook: ok=${result.ok}, changed=${result.changed}, registered=${result.status.registered}` + (result.error ? `, error=${result.error.code}` : ''));

  if (!result.ok && result.error) {
    // Inline-diagnostic flow: park the structured error in extension state,
    // re-render the sidebar so renderInstallErrorPanel takes over with a
    // tailored explanation + actions. Toasts are too transient — users miss
    // them and end up retrying blindly.
    lastInstallError = result.error;
    // Re-probe node when the failure is "no-node" so a future Recheck click
    // (or a retry after the user installs Node) reflects reality.
    if (result.error.code === 'no-node') cachedNodeInfo = false;
    refresh();
    return;
  }

  // Success path — clear any sticky failure and reset the "Don't ask again"
  // flag so a future uninstall + reinstall cycle prompts again.
  lastInstallError = null;
  context.globalState.update(SETUP_PROMPT_DECLINED_KEY, undefined);
  computeHookOutdated(context);

  if (result.changed) {
    vscode.window.showInformationMessage(
      `Claude Usage: hook installed at ${result.status.scriptPath}. Run a turn in Claude Code — the log will start populating.`
    );
  } else {
    vscode.window.showInformationMessage('Claude Usage: hook already configured.');
  }

  // Activation may have skipped wiring a watcher (no log file existed).
  // Now that the hook is registered we want to pick up the very first
  // turn that creates the log — restart so we either watch the file
  // (if it now exists) or the parent dir (if the hook hasn't fired yet).
  startWatcher();
  refresh();
}

async function doRemoveHook() {
  const choice = await vscode.window.showWarningMessage(
    'Remove the Claude Usage Monitor Stop hook from settings.json?',
    { modal: true },
    'Remove (keep script)',
    'Remove and delete script'
  );
  if (!choice) return;
  const removeScript = choice === 'Remove and delete script';
  try {
    const { changed, status } = uninstallHook(removeScript);
    log(`removeHook: changed=${changed}, registered=${status.registered}, scriptInstalled=${status.scriptInstalled}`);
    vscode.window.showInformationMessage(
      changed ? 'Claude Usage: hook removed.' : 'Claude Usage: nothing to remove.'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Claude Usage: ${msg}`);
  }
}

async function showHookInvocationLog() {
  const logPath = path.join(require('os').homedir(), '.claude', 'claude-usage-monitor-hook.invocations.log');
  if (!fs.existsSync(logPath)) {
    vscode.window.showInformationMessage(
      `Claude Usage: invocation log not found at ${logPath}. The hook has never run yet — make a turn in Claude Code and try again.`
    );
    return;
  }
  const doc = await vscode.workspace.openTextDocument(logPath);
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function showHookStatus() {
  const s = getHookStatus();
  const lines = [
    `Hook script:    ${s.scriptInstalled ? '✓' : '✗'}  ${s.scriptPath}`,
    `Registered:     ${s.registered ? '✓' : '✗'}  in ${s.settingsPath}`,
    `Other Stop hooks: ${s.externalStopHookCount}`,
  ];
  vscode.window.showInformationMessage('Claude Usage hook status:\n' + lines.join('\n'), { modal: true });
}

export function deactivate() {
  watcher?.close();
  if (debounce) clearTimeout(debounce);
}

function startWatcher() {
  watcher?.close();
  watcher = undefined;
  const p = getLogPath();
  const scheduleRefresh = (reason: string) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      log(`watcher: ${reason}`);
      refresh();
    }, 200);
  };

  if (fs.existsSync(p)) {
    try {
      watcher = fs.watch(p, () => scheduleRefresh('log changed'));
      log(`watcher: watching ${p}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`watcher ERROR: ${msg}`);
    }
    return;
  }

  // Log file doesn't exist yet — most commonly because the user just
  // installed the hook and hasn't completed a turn yet. Watch the parent
  // directory so the sidebar flips to live-data state automatically when
  // the hook fires for the first time, instead of waiting for some
  // unrelated event (visibility change, manual refresh) to pick it up.
  const dir = path.dirname(p);
  const filename = path.basename(p);
  if (!fs.existsSync(dir)) {
    log(`watcher: parent directory missing (${dir}); cannot watch for log creation`);
    return;
  }
  try {
    watcher = fs.watch(dir, (_event, file) => {
      if (file && file.toString() !== filename) return;
      if (!fs.existsSync(p)) return;
      log(`watcher: log file appeared at ${p}; rebinding`);
      startWatcher();
      scheduleRefresh('log created');
    });
    log(`watcher: watching parent ${dir} for ${filename}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`watcher ERROR (parent dir): ${msg}`);
  }
}

function refresh() {
  const p = getLogPath();
  const hookRegistered = getHookStatus().registered;
  // Resolve node lazily on the first refresh that actually needs the
  // information (i.e. when we'd be rendering an error or waiting state).
  // For the happy path with stats + log present we still pass the cached
  // value through so the sidebar can show "Node v… detected" if the user
  // ever clicks Recheck from a healthy state.
  const nodeInfo = cachedNodeInfo === null ? getNodeInfo() : cachedNodeInfo;
  if (!fs.existsSync(p)) {
    currentSamples = [];
    currentState = {
      stats: currentState.stats,
      error: { code: 'no-log', detail: `Log file not found: ${p}` },
      lastFetchAt: currentState.lastFetchAt,
      hookOutdated: hookOutdatedInfo,
      hookRegistered,
      nodeInfo,
      lastInstallError,
    };
    log(`refresh: log file does not exist`);
    panelProvider.update(currentState);
    updateStatusBar();
    return;
  }
  currentSamples = readAll(p, getReadOpts());
  const sample = currentSamples.length > 0 ? currentSamples[currentSamples.length - 1] : null;
  if (!sample) {
    currentState = {
      stats: currentState.stats,
      error: { code: 'empty-log', detail: 'Log file exists but no parseable entries.' },
      lastFetchAt: currentState.lastFetchAt,
      hookOutdated: hookOutdatedInfo,
      hookRegistered,
      nodeInfo,
      lastInstallError,
    };
    log(`refresh: no parseable lines`);
  } else {
    currentState = {
      stats: {
        fiveHour: { percent: sample.five, resetsIn: sample.fiveResetsIn, delta: sample.fiveDelta, windowReset: sample.fiveWindowReset },
        week:     { percent: sample.week, resetsIn: sample.weekResetsIn, delta: sample.weekDelta, windowReset: sample.weekWindowReset },
        fetchedAt: sample.ts,
        stale: sample.stale,
      },
      error: null,
      lastFetchAt: sample.ts,
      hookOutdated: hookOutdatedInfo,
      hookRegistered,
      nodeInfo,
      lastInstallError,
    };
    log(`refresh: 5h=${sample.five}% (Δ${sample.fiveDelta}${sample.fiveWindowReset ? ' RESET' : ''}) week=${sample.week}% (Δ${sample.weekDelta}${sample.weekWindowReset ? ' RESET' : ''}) stale=${sample.stale} @ ${sample.ts}`);
  }
  panelProvider.update(currentState);
  updateStatusBar();
  if (chartPanel) pushChartData();
  if (tokensPanel) pushTokensData();
}

function updateStatusBar() {
  const stats = currentState.stats;
  if (!stats) {
    statusItem.text = currentState.error?.code === 'no-log' ? '$(warning) Claude: no hook' : '$(pulse) Claude: …';
    statusItem.tooltip = currentState.error?.detail ?? 'Reading Claude usage log…';
    statusItem.show();
    return;
  }
  const h = stats.fiveHour;
  const w = stats.week;
  const icon =
    h.percent >= 80 || w.percent >= 80 ? '$(warning)' :
    h.percent >= 50 || w.percent >= 50 ? '$(pulse)' :
    '$(check)';
  const fmtSeg = (pct: number, delta: number | null, windowReset: boolean) => {
    const main = `${pct.toFixed(0)}%`;
    if (delta == null) return windowReset ? `${main} (reset)` : main;
    const sign = delta > 0 ? '+' : delta < 0 ? '' : '';
    const inner = `${sign}${delta.toFixed(0)}%${windowReset ? ' new' : ''}`;
    return `${main} (${inner})`;
  };
  statusItem.text = `${icon} ${fmtSeg(h.percent, h.delta, h.windowReset)}, ${fmtSeg(w.percent, w.delta, w.windowReset)}`;
  const turnLine = (label: string, delta: number | null, reset: boolean) => {
    if (delta == null) return reset ? `- ${label}: _window just reset — delta hidden_\n` : '';
    const sign = delta > 0 ? '+' : '';
    const tag = reset ? ' _(in new window after reset)_' : '';
    return `- ${label}: **${sign}${delta.toFixed(2)}%**${tag}\n`;
  };
  statusItem.tooltip = new vscode.MarkdownString(
    `**Claude Code usage**\n\n` +
    `- 5-hour: **${h.percent.toFixed(2)}%**${h.resetsIn ? ' (resets in ' + h.resetsIn + ')' : ''}${h.windowReset ? ' · _window just reset_' : ''}\n` +
    `- Weekly: **${w.percent.toFixed(2)}%**${w.resetsIn ? ' (resets in ' + w.resetsIn + ')' : ''}${w.windowReset ? ' · _window just reset_' : ''}\n` +
    turnLine('Last turn (5h)', h.delta, h.windowReset) +
    `\nClick to refresh.`
  );
  statusItem.show();
}

class UsagePanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: false, enableCommandUris: true };
    this.render();
    view.onDidChangeVisibility(() => { if (view.visible) refresh(); });
  }

  update(_state: ViewState) { this.render(); }

  private render() {
    if (!this.view) return;
    this.view.webview.html = renderHtml(randomNonce(), currentState, currentSamples, getSettings(), getTokensSettings(), pricingTable, settingsOpen);
  }
}

function randomNonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

async function showDailySummary() {
  const entries = readAll(getLogPath(), getReadOpts());
  const md = renderDailySummaryMarkdownFromEntries(entries, getLogPath());
  const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });
  await vscode.commands.executeCommand('markdown.showPreviewToSide');
}

async function openLogFile() {
  const p = getLogPath();
  if (!fs.existsSync(p)) {
    vscode.window.showWarningMessage(`Claude Usage: log file not found at ${p}. Is the Stop hook configured?`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(p);
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function openPricingFile() {
  const p = path.join(extensionContext.extensionPath, 'media', 'pricing.json');
  if (!fs.existsSync(p)) {
    vscode.window.showWarningMessage(`Claude Usage: pricing.json missing at ${p}.`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(p);
  await vscode.window.showTextDocument(doc, { preview: false });
}

let chartPanel: vscode.WebviewPanel | undefined;

function showChart() {
  if (chartPanel) {
    chartPanel.reveal(vscode.ViewColumn.Beside);
    pushChartData();
    return;
  }
  chartPanel = vscode.window.createWebviewPanel(
    'claudeUsageChart',
    'Claude Usage — Chart',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  chartPanel.onDidDispose(() => { chartPanel = undefined; });
  chartPanel.webview.onDidReceiveMessage((msg: any) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'settings' && msg.settings) {
      extensionContext.globalState.update(CHART_SETTINGS_KEY, msg.settings);
      // Re-render sidebar so the mini chart picks up the new settings live.
      panelProvider.update(currentState);
    } else if (msg.type === 'ready') {
      // Webview script has finished loading and is listening for data
      // messages; push the latest in case the log moved between html
      // bake and script start.
      pushChartData();
    }
  });
  // Render the html shell once with initial data baked in. From here on,
  // every log change is delivered via postMessage — the webview's JS
  // keeps running even when the tab is hidden (retainContextWhenHidden:
  // true), so mutations to the SVG persist and are visible immediately
  // when the user returns to the tab.
  const entries = readAll(getLogPath(), getReadOpts());
  const data = prepareChartData(entries, pricingTable, getSettings().vscodeSkin);
  chartPanel.webview.html = renderChartHtml(randomNonce(), data, getSettings());
}

function pushChartData() {
  if (!chartPanel) return;
  const entries = readAll(getLogPath(), getReadOpts());
  const data = prepareChartData(entries, pricingTable, getSettings().vscodeSkin);
  chartPanel.webview.postMessage({ type: 'data', data });
}

let tokensPanel: vscode.WebviewPanel | undefined;

function showTokens() {
  if (tokensPanel) {
    tokensPanel.reveal(vscode.ViewColumn.Beside);
    pushTokensData();
    return;
  }
  tokensPanel = vscode.window.createWebviewPanel(
    'claudeUsageTokens',
    'Claude Usage — Tokens',
    vscode.ViewColumn.Beside,
    { enableScripts: true, enableCommandUris: true, retainContextWhenHidden: true }
  );
  tokensPanel.onDidDispose(() => { tokensPanel = undefined; });
  tokensPanel.webview.onDidReceiveMessage((msg: any) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'tokenSettings' && msg.settings) {
      extensionContext.globalState.update(TOKENS_SETTINGS_KEY, msg.settings);
      panelProvider.update(currentState);
    } else if (msg.type === 'ready') {
      pushTokensData();
    }
  });
  const entries = readAll(getLogPath(), getReadOpts());
  const data = prepareChartData(entries, pricingTable, getSettings().vscodeSkin);
  tokensPanel.webview.html = renderTokensHtml(randomNonce(), data, getTokensSettings());
}

function pushTokensData() {
  if (!tokensPanel) return;
  const entries = readAll(getLogPath(), getReadOpts());
  const data = prepareChartData(entries, pricingTable, getSettings().vscodeSkin);
  tokensPanel.webview.postMessage({ type: 'data', data });
}
