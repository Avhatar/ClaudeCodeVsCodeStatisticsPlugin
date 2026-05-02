import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_LOG_PATH, readAll, readLatest, ParsedSample } from './logSource';
import { renderHtml, ViewState } from './webview';
import { renderDailySummaryMarkdownFromEntries } from './history';
import { prepareChartData } from './chart';
import { renderChartHtml } from './chartView';
import { getHookStatus, installHook, uninstallHook, HOOK_FILENAME } from './hookSetup';
import { ChartSettings, DEFAULT_CHART_SETTINGS } from './chartLogic';

const SETUP_PROMPT_DECLINED_KEY = 'claudeUsage.setupPromptDeclined';
const CHART_SETTINGS_KEY = 'claudeUsage.chartSettings';

let extensionContext: vscode.ExtensionContext;
let currentSamples: ParsedSample[] = [];
function getSettings(): ChartSettings {
  const saved = extensionContext?.globalState.get<ChartSettings>(CHART_SETTINGS_KEY);
  return saved ? { ...DEFAULT_CHART_SETTINGS, ...saved } : DEFAULT_CHART_SETTINGS;
}

let statusItem: vscode.StatusBarItem;
let panelProvider: UsagePanelProvider;
let logChannel: vscode.OutputChannel;
let watcher: fs.FSWatcher | undefined;
let debounce: NodeJS.Timeout | undefined;

let currentState: ViewState = { stats: null, error: null, lastFetchAt: null };

function log(msg: string) {
  if (!logChannel) return;
  logChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

function getLogPath(): string {
  const cfg = vscode.workspace.getConfiguration('claudeUsage').get<string>('logPath');
  return cfg && cfg.trim() ? cfg : DEFAULT_LOG_PATH;
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
    vscode.commands.registerCommand('claudeUsage.showChart', () => showChart()),
    vscode.commands.registerCommand('claudeUsage.openLogFile', () => openLogFile()),
    vscode.commands.registerCommand('claudeUsage.showLog', () => logChannel.show(true)),
    vscode.commands.registerCommand('claudeUsage.setupHook', () => doSetupHook(context)),
    vscode.commands.registerCommand('claudeUsage.removeHook', () => doRemoveHook()),
    vscode.commands.registerCommand('claudeUsage.showHookStatus', () => showHookStatus()),
    vscode.commands.registerCommand('claudeUsage.showHookInvocationLog', () => showHookInvocationLog()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeUsage.logPath')) {
        startWatcher();
        refresh();
      }
    })
  );

  startWatcher();
  refresh();
  maybePromptSetup(context);
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
  const choice = await vscode.window.showInformationMessage(
    'Claude Usage Monitor: install Stop hook so the plugin can track API usage?',
    'Install hook',
    'Open settings.json',
    "Don't ask again"
  );
  if (choice === 'Install hook') {
    await doSetupHook(context);
  } else if (choice === 'Open settings.json') {
    const sp = status.settingsPath;
    if (fs.existsSync(sp)) {
      const doc = await vscode.workspace.openTextDocument(sp);
      vscode.window.showTextDocument(doc);
    }
  } else if (choice === "Don't ask again") {
    context.globalState.update(SETUP_PROMPT_DECLINED_KEY, true);
  }
}

async function doSetupHook(context: vscode.ExtensionContext) {
  const bundled = path.join(context.extensionPath, 'media', 'hooks', HOOK_FILENAME);
  if (!fs.existsSync(bundled)) {
    vscode.window.showErrorMessage(`Claude Usage: bundled hook script missing at ${bundled}`);
    return;
  }
  try {
    const { changed, status } = installHook(bundled);
    log(`setupHook: changed=${changed}, scriptInstalled=${status.scriptInstalled}, registered=${status.registered}`);
    if (changed) {
      vscode.window.showInformationMessage(
        `Claude Usage: hook installed at ${status.scriptPath}. Run a turn in Claude Code — the log will start populating.`
      );
    } else {
      vscode.window.showInformationMessage('Claude Usage: hook already configured.');
    }
    context.globalState.update(SETUP_PROMPT_DECLINED_KEY, undefined);
    refresh();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`setupHook ERROR: ${msg}`);
    vscode.window.showErrorMessage(`Claude Usage: hook setup failed — ${msg}`);
  }
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
  if (!fs.existsSync(p)) {
    log(`watcher: log file does not exist (${p}); will retry on next change`);
    return;
  }
  try {
    watcher = fs.watch(p, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        log(`watcher: log changed`);
        refresh();
      }, 200);
    });
    log(`watcher: watching ${p}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`watcher ERROR: ${msg}`);
  }
}

function refresh() {
  const p = getLogPath();
  if (!fs.existsSync(p)) {
    currentSamples = [];
    currentState = {
      stats: currentState.stats,
      error: { code: 'no-log', detail: `Log file not found: ${p}` },
      lastFetchAt: currentState.lastFetchAt,
    };
    log(`refresh: log file does not exist`);
    panelProvider.update(currentState);
    updateStatusBar();
    return;
  }
  currentSamples = readAll(p);
  const sample = currentSamples.length > 0 ? currentSamples[currentSamples.length - 1] : null;
  if (!sample) {
    currentState = {
      stats: currentState.stats,
      error: { code: 'empty-log', detail: 'Log file exists but no parseable entries.' },
      lastFetchAt: currentState.lastFetchAt,
    };
    log(`refresh: no parseable lines`);
  } else {
    currentState = {
      stats: {
        fiveHour: { percent: sample.five, resetsIn: sample.fiveResetsIn, delta: sample.fiveDelta },
        week: { percent: sample.week, resetsIn: sample.weekResetsIn, delta: sample.weekDelta },
        fetchedAt: sample.ts,
        stale: sample.stale,
      },
      error: null,
      lastFetchAt: sample.ts,
    };
    log(`refresh: 5h=${sample.five}% (Δ${sample.fiveDelta}) week=${sample.week}% (Δ${sample.weekDelta}) stale=${sample.stale} @ ${sample.ts}`);
  }
  panelProvider.update(currentState);
  updateStatusBar();
  if (chartPanel) refreshChart();
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
  const fmtSeg = (pct: number, delta: number | null) => {
    const main = `${pct.toFixed(0)}%`;
    if (delta == null) return main;
    const sign = delta > 0 ? '+' : delta < 0 ? '' : '';
    return `${main} (${sign}${delta.toFixed(0)}%)`;
  };
  statusItem.text = `${icon} ${fmtSeg(h.percent, h.delta)}, ${fmtSeg(w.percent, w.delta)}`;
  statusItem.tooltip = new vscode.MarkdownString(
    `**Claude Code usage**\n\n` +
    `- 5-hour: **${h.percent.toFixed(2)}%**${h.resetsIn ? ' (resets in ' + h.resetsIn + ')' : ''}\n` +
    `- Weekly: **${w.percent.toFixed(2)}%**${w.resetsIn ? ' (resets in ' + w.resetsIn + ')' : ''}\n` +
    (h.delta != null ? `- Last turn: **${h.delta > 0 ? '+' : ''}${h.delta.toFixed(2)}%** of 5h\n` : '') +
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
    this.view.webview.html = renderHtml(randomNonce(), currentState, currentSamples, getSettings());
  }
}

function randomNonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

async function showDailySummary() {
  const entries = readAll(getLogPath());
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

let chartPanel: vscode.WebviewPanel | undefined;

function showChart() {
  if (chartPanel) {
    chartPanel.reveal(vscode.ViewColumn.Beside);
    refreshChart();
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
    if (msg && msg.type === 'settings' && msg.settings) {
      extensionContext.globalState.update(CHART_SETTINGS_KEY, msg.settings);
      // Re-render sidebar so the mini chart picks up the new settings live.
      panelProvider.update(currentState);
    }
  });
  refreshChart();
}

function refreshChart() {
  if (!chartPanel) return;
  const entries = readAll(getLogPath());
  const data = prepareChartData(entries);
  chartPanel.webview.html = renderChartHtml(randomNonce(), data);
}
