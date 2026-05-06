import { UsageStats, ParsedSample } from './logSource';
import { ChartSettings, TokensChartSettings, parseRange, windowFromRange, parseDur, midColor } from './chartLogic';
import { PricingTable } from './pricing';

export interface ViewState {
  stats: UsageStats | null;
  error: { code: string; detail?: string } | null;
  lastFetchAt: string | null;
  hookOutdated: { installed: string | null; bundled: string } | null;
  hookRegistered: boolean;
}

export function renderHtml(
  nonce: string,
  state: ViewState,
  samples: ParsedSample[],
  settings: ChartSettings,
  tokensSettings: TokensChartSettings,
  pricing: PricingTable | null,
  settingsOpen: boolean,
): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

  let body: string;
  if (state.stats) {
    body = renderStats(state.stats, samples, pricing, settings)
      + renderMiniChart(samples, settings)
      + renderTokensMiniChart(samples, tokensSettings, pricing)
      + renderSettings(settings, settingsOpen);
  } else if (state.error) {
    body = renderError(state.error, state.hookRegistered);
  } else {
    body = renderLoading();
  }
  if (state.hookOutdated) body = renderUpdateBanner(state.hookOutdated) + body;

  const bodyClass = settings.vscodeSkin ? 'theme-vscode' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  :root {
    --bar-bg: var(--vscode-editorWidget-background, #2a2a2a);
    --bar-border: var(--vscode-widget-border, #3c3c3c);
    --text: var(--vscode-foreground, #ddd);
    --muted: var(--vscode-descriptionForeground, #999);
    --good: #4ade80;
    --warn: #facc15;
    --bad: #f87171;
    --accent: var(--vscode-textLink-foreground, #4aa7f7);
  }
  body {
    font-family: var(--vscode-font-family);
    color: var(--text);
    padding: 12px 14px;
    margin: 0;
    font-size: var(--vscode-font-size, 13px);
  }
  h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 0 0 6px;
    font-weight: 600;
  }
  .card { margin-bottom: 18px; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .pct {
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .reset {
    font-size: 11px;
    color: var(--muted);
  }
  .bar {
    width: 100%;
    height: 10px;
    background: var(--bar-bg);
    border: 1px solid var(--bar-border);
    border-radius: 5px;
    overflow: hidden;
  }
  .bar > .fill {
    height: 100%;
    transition: width 0.4s ease;
    border-radius: 4px;
  }
  .delta {
    font-size: 11px;
    margin-top: 5px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .delta.up { color: var(--bad); }
  .delta.down { color: var(--good); }
  .meta {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--bar-border);
    font-size: 11px;
    color: var(--muted);
    line-height: 1.6;
  }
  .meta b { color: var(--text); font-weight: 500; }
  .turn-row {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }
  .turn-card {
    flex: 1 1 0;
    background: var(--bar-bg);
    border: 1px solid var(--bar-border);
    border-radius: 6px;
    padding: 10px 12px;
    text-align: center;
  }
  .mini {
    margin-bottom: 18px;
  }
  /* Mini-chart island uses a fixed dark palette regardless of VS Code theme.
     The chart paths / day-boundary dashes / low-alpha grid were tuned for a
     dark backdrop and become unreadable on a light theme. The rest of the
     sidebar (text, progress bars) keeps inheriting --vscode-* tokens. */
  .mini-link {
    display: block;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }
  .mini-link:hover .mini-svg,
  .mini-link:hover .mini-empty {
    border-color: #4aa7f7;
  }
  .mini-svg {
    width: 100%;
    height: 96px;
    background: #2a2a2a;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    display: block;
    transition: border-color 0.15s ease;
  }
  .mini-empty {
    background: #2a2a2a;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    padding: 22px 8px;
    text-align: center;
    color: #999;
    font-size: 11px;
    font-style: italic;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }
  /* Theme-vscode override (body class set by renderHtml from ChartSettings.vscodeSkin):
     swap the mini-chart island's locked dark backdrop for theme tokens. */
  body.theme-vscode .mini-svg,
  body.theme-vscode .mini-empty {
    background: var(--vscode-editorWidget-background, #2a2a2a);
    border-color: var(--vscode-widget-border, #3c3c3c);
  }
  body.theme-vscode .mini-empty { color: var(--vscode-descriptionForeground, #999); }
  .turn-card .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .turn-card .pct {
    display: block;
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .turn-card .sub {
    font-size: 10px;
    color: var(--muted);
    margin-top: 3px;
  }
  .turn-cost {
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    margin: -10px 0 18px;
  }
  .turn-cost b { color: var(--text); font-variant-numeric: tabular-nums; }
  .spent {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
    margin-bottom: 6px;
    font-variant-numeric: tabular-nums;
  }
  .spent b { color: var(--text); }
  .spent .hint { color: var(--muted); font-size: 10px; margin-left: 4px; }
  .settings {
    background: var(--bar-bg);
    border: 1px solid var(--bar-border);
    border-radius: 5px;
    margin-top: 4px;
    margin-bottom: 4px;
    font-size: 11px;
  }
  a.settings-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 10px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-decoration: none;
  }
  a.settings-summary:hover { color: var(--text); }
  a.settings-summary .caret { color: var(--muted); }
  .settings .opts { padding: 0 10px 8px; display: flex; flex-direction: column; gap: 2px; }
  .settings a.opt {
    display: flex; justify-content: space-between; align-items: center;
    padding: 5px 6px; border-radius: 3px;
    color: var(--text); text-decoration: none;
  }
  .settings a.opt:hover { background: var(--bar-border); }
  .settings a.opt .state {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 10px;
  }
  .settings a.opt.on .state { color: var(--good); }
  .settings a.opt.off .state { color: var(--muted); }
  .empty, .err {
    color: var(--muted);
    text-align: center;
    margin-top: 30px;
    line-height: 1.6;
  }
  .err code {
    background: var(--bar-bg);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--bad);
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .err a {
    color: var(--accent);
    text-decoration: none;
  }
  .err a.btn {
    display: inline-block;
    padding: 4px 12px;
    background: var(--accent);
    color: var(--vscode-editor-background, #1e1e1e);
    border-radius: 4px;
    margin-top: 6px;
  }
  .err a.btn:hover { opacity: 0.9; }
  .update-banner {
    background: #2a2a2a;
    border: 1px solid #facc15;
    border-radius: 5px;
    padding: 8px 10px;
    margin-bottom: 14px;
    font-size: 11px;
    color: #ddd;
    line-height: 1.5;
  }
  .update-banner .ttl { color: #facc15; font-weight: 600; }
  .update-banner a {
    display: inline-block;
    margin-top: 6px;
    padding: 3px 10px;
    background: #facc15;
    color: #1e1e1e;
    border-radius: 3px;
    text-decoration: none;
    font-weight: 500;
  }
  .update-banner a:hover { opacity: 0.9; }
  .update-banner .ver { color: #999; font-family: var(--vscode-editor-font-family, monospace); }
</style>
</head>
<body class="${bodyClass}">
${body}
</body>
</html>`;
}

function renderLoading(): string {
  return `<div class="empty">Fetching usage…</div>`;
}

function renderUpdateBanner(info: { installed: string | null; bundled: string }): string {
  const from = info.installed ?? 'unknown';
  return `<div class="update-banner">
    <div class="ttl">Hook update available</div>
    <div>Installed <span class="ver">${escapeHtml(from)}</span> → bundled <span class="ver">${escapeHtml(info.bundled)}</span></div>
    <a href="command:claudeUsage.updateHook">Update hook</a>
  </div>`;
}

function renderError(err: { code: string; detail?: string }, hookRegistered: boolean): string {
  // Hook already registered but log file is absent: the Stop hook just hasn't
  // fired yet. Show a friendly waiting state instead of pushing the user back
  // to the install button — that was the source of the "I clicked install but
  // the install button is still here" confusion.
  if (err.code === 'no-log' && hookRegistered) {
    return `<div class="err">
      <p>Hook installed</p>
      <div>Waiting for the first Claude Code turn — the log will populate as soon as a response completes.</div>
    </div>`;
  }
  const setupLink = `<p><a href="command:claudeUsage.setupHook" class="btn">Install hook</a> &nbsp; <a href="command:claudeUsage.showHookStatus">Status</a></p>`;
  const hint =
    err.code === 'no-log' ? `Claude Code <b>Stop</b> hook is not configured — no usage log to read.${setupLink}` :
    err.code === 'empty-log' ? 'Log file exists but contains no parseable lines yet. After Claude finishes one turn the log will be populated.' :
    'Unable to read Claude usage log.';
  return `<div class="err">
    <p>⚠ <code>${escapeHtml(err.code)}</code></p>
    <div>${hint}</div>
    ${err.detail ? `<p style="font-size:11px;opacity:0.7">${escapeHtml(err.detail)}</p>` : ''}
  </div>`;
}

function renderSettings(settings: ChartSettings, open: boolean): string {
  // Native <details> resets to its initial open-state every time the host
  // replaces innerHTML — so toggling any option would collapse the section.
  // We track open-state in extension memory and reflect it via a CSS class.
  const row = (label: string, on: boolean, command: string, hint?: string) => {
    return `<a class="opt ${on ? 'on' : 'off'}" href="command:${command}" title="${escapeHtml(hint ?? '')}">
      <span>${escapeHtml(label)}</span>
      <span class="state">${on ? 'ON' : 'OFF'}</span>
    </a>`;
  };
  return `
    <div class="settings ${open ? 'is-open' : ''}">
      <a class="settings-summary" href="command:claudeUsage.toggleSettingsOpen">
        <span>Settings</span>
        <span class="caret">${open ? '▴' : '▾'}</span>
      </a>
      ${open ? `<div class="opts">
        ${row('Show USD spent', settings.showUsdSpent, 'claudeUsage.toggleShowUsdSpent', 'Display per-window and per-turn dollar amounts in this sidebar')}
        ${row('VS Code skin support', settings.vscodeSkin, 'claudeUsage.toggleVscodeSkin', 'When ON, chart panels follow your VS Code theme colours; when OFF (default) they use a locked dark palette tuned for the chart visuals')}
        ${row('Ignore bugged API data', settings.ignoreBuggedApiData, 'claudeUsage.toggleIgnoreBuggedApiData', "Anthropic's rate-limit endpoint occasionally returns clearly impossible values (e.g. week 100% mid-window after a string of 0% readings, with no countdown reset). When ON (default), each window's reading is compared against the previous one — if it jumps by more than 50 percentage points without a countdown reset, that window is treated as a failed readout and the previous valid value is shown instead. The other window, the per-turn token counts, and the model are unaffected. Suppressed points show in magenta on the chart with an explanatory tooltip. The raw log file is left untouched so forensics stay accurate. Turn this OFF to see exactly what the API returned, even when obviously wrong.")}
      </div>` : ''}
    </div>
  `;
}

function renderStats(s: UsageStats, samples: ParsedSample[], pricing: PricingTable | null, settings: ChartSettings): string {
  const ts = new Date(s.fetchedAt);
  const tsLocal = isNaN(ts.getTime()) ? s.fetchedAt : ts.toLocaleTimeString();
  const staleNote = s.stale ? ` <span style="color: var(--warn, #facc15)">· stale (API unavailable)</span>` : '';

  // Per-turn cost = cost of the latest sample that has token data. Stale
  // carry-forward samples have null tokens, so we walk back to the last real
  // turn instead. costForSampleTotal returns null if pricing is missing.
  let lastTurnCost: number | null = null;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].tokIn != null) {
      lastTurnCost = costForSampleTotal(samples[i], pricing);
      break;
    }
  }

  // Total spent inside the current 5h / weekly window. Window start is derived
  // from the latest sample's resetsIn countdown: resetsAt = sample.ts + parsed,
  // windowStart = resetsAt - windowMs. If the countdown is missing or unparseable
  // we just don't show the spent number.
  const HOUR_MS = 3_600_000;
  const fiveSpentRaw = computeWindowSpent(samples, s.fiveHour.resetsIn, ts.getTime(),  5 * HOUR_MS,   pricing);
  const weekSpentRaw = computeWindowSpent(samples, s.week.resetsIn,    ts.getTime(), 168 * HOUR_MS,   pricing);
  // Settings.showUsdSpent gates the visible cost lines; helpers are still
  // computed so the cost mini-toggle in the settings dropdown takes effect
  // immediately on next render without waiting for a fresh refresh.
  const fiveSpent = settings.showUsdSpent ? fiveSpentRaw : null;
  const weekSpent = settings.showUsdSpent ? weekSpentRaw : null;
  const turnCost  = settings.showUsdSpent ? lastTurnCost  : null;

  return `
    ${renderTurnCard(s, turnCost)}
    ${renderBar('5-Hour Limit', s.fiveHour.percent, s.fiveHour.delta, s.fiveHour.resetsIn, fiveSpent, s.fiveHour.windowReset)}
    ${renderBar('Weekly Limit', s.week.percent,    s.week.delta,    s.week.resetsIn,    weekSpent, s.week.windowReset)}
    <div class="meta">
      <div>Last fetched: <b>${escapeHtml(tsLocal)}</b>${staleNote}</div>
    </div>
  `;
}

function costForSampleTotal(p: ParsedSample, pricing: PricingTable | null): number | null {
  if (!pricing) return null;
  if (p.tokIn == null || p.tokOut == null || p.tokCacheCreate == null || p.tokCacheRead == null) return null;
  const price = lookupModelPrice(pricing, p.model);
  if (!price) return null;
  return (p.tokOut || 0) * price.output         / 1_000_000 +
         (p.tokIn  || 0) * price.input          / 1_000_000 +
         (p.tokCacheCreate || 0) * price.cache_write_5m / 1_000_000 +
         (p.tokCacheRead   || 0) * price.cache_read     / 1_000_000;
}

function computeWindowSpent(
  samples: ParsedSample[],
  resetsIn: string | null,
  latestTsMs: number,
  windowMs: number,
  pricing: PricingTable | null,
): number | null {
  if (!pricing || !resetsIn) return null;
  const remaining = parseDur(resetsIn);
  if (remaining == null) return null;
  const resetAtMs = latestTsMs + remaining;
  const windowStartMs = resetAtMs - windowMs;
  let total = 0;
  let counted = 0;
  for (const p of samples) {
    const t = new Date(p.ts).getTime();
    if (t < windowStartMs) continue;
    const c = costForSampleTotal(p, pricing);
    if (c != null) { total += c; counted++; }
  }
  return counted > 0 ? total : null;
}

function renderTurnCard(s: UsageStats, lastTurnCost: number | null): string {
  const d5 = s.fiveHour.delta;
  const dw = s.week.delta;
  const r5 = s.fiveHour.windowReset;
  const rw = s.week.windowReset;
  const hasSomething = d5 != null || dw != null || r5 || rw;
  const costLine = lastTurnCost != null
    ? `<div class="turn-cost">this turn: <b>${escapeHtml(fmtUsdShort(lastTurnCost))}</b></div>`
    : '';

  if (!hasSomething) {
    return `
      <h2>Last Turn (since previous fetch)</h2>
      <div class="turn-row">
        <div class="turn-card">
          <div class="label">5h Δ</div>
          <span class="pct" style="color: var(--muted)">—</span>
          <div class="sub">first sample</div>
        </div>
        <div class="turn-card">
          <div class="label">Week Δ</div>
          <span class="pct" style="color: var(--muted)">—</span>
          <div class="sub">first sample</div>
        </div>
      </div>
      ${costLine}
    `;
  }

  return `
    <h2>Last Turn (since previous fetch)</h2>
    <div class="turn-row">
      ${turnCard('5h Δ', d5, r5)}
      ${turnCard('Week Δ', dw, rw)}
    </div>
    ${costLine}
  `;
}

function turnCard(label: string, delta: number | null, windowReset: boolean): string {
  if (delta == null) {
    if (windowReset) {
      return `
        <div class="turn-card" title="The window reset between the previous fetch and this one.">
          <div class="label">${escapeHtml(label)}</div>
          <span class="pct" style="color: var(--muted); font-size: 14px;">window reset</span>
          <div class="sub">new window</div>
        </div>
      `;
    }
    return `
      <div class="turn-card">
        <div class="label">${escapeHtml(label)}</div>
        <span class="pct" style="color: var(--muted)">—</span>
        <div class="sub">no data</div>
      </div>
    `;
  }
  // After a window reset the delta represents the spend of this single first
  // turn in the fresh window (= cur.percent). Show it like a normal positive
  // delta but tag the subtitle so the reset is still visible.
  const color = delta > 0.005 ? 'var(--bad)' : delta < -0.005 ? 'var(--good)' : 'var(--muted)';
  const sub = windowReset ? 'new window' : delta > 0.005 ? 'consumed' : delta < -0.005 ? 'window reset' : 'no change';
  const title = windowReset ? 'The window reset between the previous fetch and this one. The number shown is this turn\'s spend in the fresh window.' : '';
  return `
    <div class="turn-card"${title ? ` title="${escapeHtml(title)}"` : ''}>
      <div class="label">${escapeHtml(label)}</div>
      <span class="pct" style="color: ${color}">${signed(delta)}%</span>
      <div class="sub">${sub}</div>
    </div>
  `;
}

function renderBar(label: string, percent: number, delta: number | null, resetsIn: string | null, spentUsd: number | null, windowReset: boolean): string {
  const color = percent >= 80 ? 'var(--bad)' : percent >= 50 ? 'var(--warn)' : 'var(--good)';
  const w = Math.min(100, Math.max(0, percent));
  let deltaCls = '';
  let deltaTxt = '';
  if (delta != null) {
    deltaCls = delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : '';
    deltaTxt = windowReset
      ? `Δ ${signed(delta)}% in new window (after reset)`
      : `Δ ${signed(delta)}% since last fetch`;
  } else if (windowReset) {
    deltaTxt = 'new window — Δ hidden';
  }
  const spentLine = spentUsd != null
    ? `<div class="spent"><b>${escapeHtml(fmtUsdShort(spentUsd))}</b> <span class="hint">spent in this window</span></div>`
    : '';
  return `
    <div class="card">
      <h2>${escapeHtml(label)}</h2>
      <div class="row">
        <span class="pct">${percent.toFixed(percent % 1 === 0 ? 0 : 2)}%</span>
        <span class="reset">${resetsIn ? '↻ ' + escapeHtml(resetsIn) : ''}</span>
      </div>
      ${spentLine}
      <div class="bar"><div class="fill" style="width: ${w}%; background: ${color};"></div></div>
      ${deltaTxt ? `<div class="delta ${deltaCls}">${deltaTxt}</div>` : ''}
    </div>
  `;
}

function signed(n: number): string {
  const abs = Math.abs(n);
  const s = abs < 0.005 ? '0' : n.toFixed(n % 1 === 0 ? 0 : 2);
  return (n > 0.005 ? '+' : '') + s;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderMiniChart(samples: ParsedSample[], s: ChartSettings): string {
  const W = 240, H = 96;
  const PAD = { top: 4, right: 4, bottom: 4, left: 4 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;

  const range = parseRange(s.days);
  if ('error' in range) {
    return `<div class="mini"><a href="command:claudeUsage.showChart" class="mini-link" title="Open full chart"><div class="mini-empty">Chart settings: ${escapeHtml(range.error)}</div></a></div>`;
  }
  const nowMs = Date.now();
  const win = windowFromRange(range.startDay, range.endDay, nowMs);
  const visible = samples
    .filter(p => {
      const t = new Date(p.ts).getTime();
      return t >= win.fromMs && t <= win.toMs;
    })
    .map(p => ({ ...p, tsMs: new Date(p.ts).getTime() }));

  if (visible.length === 0) {
    return `<div class="mini"><a href="command:claudeUsage.showChart" class="mini-link" title="Open full chart"><div class="mini-empty">No data in window</div></a></div>`;
  }

  const xOf = (ms: number) => PAD.left + ((ms - win.fromMs) / (win.toMs - win.fromMs)) * PW;
  const yOf = (p: number) => PAD.top + PH - (Math.min(100, Math.max(0, p)) / 100) * PH;

  const fiveMid = midColor(s.fiveSat, s.fiveFade);
  const weekMid = midColor(s.weekSat, s.weekFade);
  const gapMs = s.gap * 60 * 60 * 1000;

  // Tolerance for "different reset moment" comparison. The API returns
  // resets_at with microsecond precision and the sub-second part jitters
  // sample-to-sample even within the same window — strict string compare
  // would falsely fire a reset on every sample.
  const RESET_ISO_TOLERANCE_MS = 60_000;
  const isoMs = (iso: string | null): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return isFinite(t) ? t : null;
  };

  function pathFor(
    getY: (p: ParsedSample) => number,
    getResetIso: (p: ParsedSample) => string | null,
  ): string {
    const segs: string[] = [];
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const x = xOf(p.tsMs).toFixed(1);
      const y = yOf(getY(p)).toFixed(1);
      const prev = visible[i - 1];
      const tooFar = prev && gapMs > 0 && (p.tsMs - prev.tsMs) > gapMs;
      const prevMs = prev ? isoMs(getResetIso(prev)) : null;
      const curMs = isoMs(getResetIso(p));
      const knownReset = !!(prev && prevMs != null && curMs != null && Math.abs(prevMs - curMs) > RESET_ISO_TOLERANCE_MS);
      if (knownReset && !tooFar) {
        // Old window's line ends at prev. New segment starts a synthetic zero-
        // crossing at exact reset moment (= prev.resets_at_iso) with break-
        // OnReset on, or directly at the post-reset sample with it off.
        if (s.breakOnReset) {
          const rX = xOf(prevMs!).toFixed(1);
          const rY = yOf(0).toFixed(1);
          segs.push('M' + rX + ' ' + rY);
          segs.push('L' + x + ' ' + y);
        } else {
          segs.push('M' + x + ' ' + y);
        }
      } else {
        const breakHere = i === 0 || tooFar;
        segs.push((breakHere ? 'M' : 'L') + x + ' ' + y);
      }
    }
    return segs.join(' ');
  }

  // Day-boundary verticals (only if more than one day shown)
  let dayLines = '';
  if (win.daysSpan > 1) {
    const DAY_MS = 86400000;
    const sod = new Date(win.fromMs);
    sod.setHours(0, 0, 0, 0);
    let bMs = sod.getTime() + DAY_MS;
    while (bMs < win.toMs) {
      const x = xOf(bMs).toFixed(1);
      dayLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 3" stroke-opacity="0.25"/>`;
      bMs += DAY_MS;
    }
  }

  // Reset markers: drawn ONLY when consecutive samples' resets_at_iso parsed
  // timestamps differ by more than the tolerance (microsecond jitter from the
  // API is filtered out). Old entries without ISO get no marker.
  let resetLines = '';
  for (let i = 1; i < visible.length; i++) {
    const cur = visible[i];
    const prev = visible[i - 1];
    const fivePrev = isoMs(prev.fiveResetsAtIso);
    const fiveCur = isoMs(cur.fiveResetsAtIso);
    if (fivePrev != null && fiveCur != null && Math.abs(fivePrev - fiveCur) > RESET_ISO_TOLERANCE_MS) {
      const x = xOf(fivePrev).toFixed(1);
      resetLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="${fiveMid}" stroke-width="0.7" stroke-dasharray="2 2" stroke-opacity="0.6"/>`;
    }
    const weekPrev = isoMs(prev.weekResetsAtIso);
    const weekCur = isoMs(cur.weekResetsAtIso);
    if (weekPrev != null && weekCur != null && Math.abs(weekPrev - weekCur) > RESET_ISO_TOLERANCE_MS) {
      const x = xOf(weekPrev).toFixed(1);
      resetLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="${weekMid}" stroke-width="0.7" stroke-dasharray="2 2" stroke-opacity="0.6"/>`;
    }
  }
  // predicted reset from latest non-stale
  let lastValid: ParsedSample | null = null;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (!samples[i].stale) { lastValid = samples[i]; break; }
  }
  if (lastValid) {
    const lvMs = new Date(lastValid.ts).getTime();
    const fd = parseDur(lastValid.fiveResetsIn);
    if (fd != null) {
      const r = lvMs + fd;
      if (r > win.fromMs && r < win.toMs) {
        const x = xOf(r).toFixed(1);
        resetLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="${fiveMid}" stroke-width="0.7" stroke-dasharray="2 2" stroke-opacity="0.6"/>`;
      }
    }
    const wd = parseDur(lastValid.weekResetsIn);
    if (wd != null) {
      const r = lvMs + wd;
      if (r > win.fromMs && r < win.toMs) {
        const x = xOf(r).toFixed(1);
        resetLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="${weekMid}" stroke-width="0.7" stroke-dasharray="2 2" stroke-opacity="0.6"/>`;
      }
    }
  }

  // Forecast (linear extrapolation). Per-window filter: skip stale samples
  // (no API data, carry-forward) and bugged samples for *that* window
  // (impossible API reading, carry-forward). Either kind would flatten dy
  // toward zero and silence the forecast on long stretches.
  const fcVisibleFive = visible.filter(p => !p.stale && !p.fiveBugged);
  const fcVisibleWeek = visible.filter(p => !p.stale && !p.weekBugged);
  let forecastPath = '';
  if (s.forecast) {
    function fcLine(fc: typeof visible, getY: (p: ParsedSample) => number, color: string): string {
      if (fc.length < 2) return '';
      const N = Math.min(5, fc.length);
      const last = fc[fc.length - 1];
      const first = fc[fc.length - N];
      const dt = last.tsMs - first.tsMs;
      const dy = getY(last) - getY(first);
      const yLast = getY(last);
      if (dt <= 0 || yLast >= 100) return '';
      let xEnd: number, yEnd: number, isFlat: boolean;
      if (dy <= 0) {
        // Flat / no trend — draw horizontal at current level so the user sees
        // forecast is alive but has nothing to extrapolate. Mini chart has no
        // room for a text label, so we just lean on a tighter dash pattern.
        isFlat = true;
        xEnd = win.toMs;
        yEnd = yLast;
      } else {
        isFlat = false;
        const slope = dy / dt;
        const t100 = last.tsMs + (100 - yLast) / slope;
        xEnd = Math.min(t100, win.toMs);
        if (xEnd <= last.tsMs) return '';
        yEnd = Math.min(100, yLast + slope * (xEnd - last.tsMs));
      }
      const dash = isFlat ? '1 3' : '3 2';
      const opacity = isFlat ? '0.5' : '0.7';
      return `<line x1="${xOf(last.tsMs).toFixed(1)}" y1="${yOf(yLast).toFixed(1)}" x2="${xOf(xEnd).toFixed(1)}" y2="${yOf(yEnd).toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="${dash}" stroke-opacity="${opacity}"/>`;
    }
    forecastPath += fcLine(fcVisibleWeek, p => p.week, 'url(#miniWeek)');
    forecastPath += fcLine(fcVisibleFive, p => p.five, 'url(#miniFive)');
  }

  const gridStops = [25, 50, 75]
    .map(t => `<line x1="${PAD.left}" y1="${(yOf(t)).toFixed(1)}" x2="${PAD.left + PW}" y2="${(yOf(t)).toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`)
    .join('');

  return `
    <div class="mini">
      <h2>Mini Chart</h2>
      <a href="command:claudeUsage.showChart" class="mini-link" title="Open full chart">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="mini-svg">
          <defs>
            <linearGradient id="miniFive" gradientUnits="userSpaceOnUse" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + PH}">
              <stop offset="0%" stop-color="${s.fiveFade}"/>
              <stop offset="100%" stop-color="${s.fiveSat}"/>
            </linearGradient>
            <linearGradient id="miniWeek" gradientUnits="userSpaceOnUse" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + PH}">
              <stop offset="0%" stop-color="${s.weekFade}"/>
              <stop offset="100%" stop-color="${s.weekSat}"/>
            </linearGradient>
          </defs>
          ${gridStops}
          ${dayLines}
          ${resetLines}
          <path d="${pathFor(p => p.week, p => p.weekResetsAtIso)}" fill="none" stroke="url(#miniWeek)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${pathFor(p => p.five, p => p.fiveResetsAtIso)}" fill="none" stroke="url(#miniFive)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          ${forecastPath}
        </svg>
      </a>
    </div>
  `;
}

const TOKENS_COLORS = { out: '#ff5252', in: '#ff9c3c', cc: '#ffd23f', cr: '#3ddc97' };

function lookupModelPrice(pricing: PricingTable | null, model: string | null) {
  if (!pricing || !pricing.models) return null;
  if (model && pricing.models[model]) return pricing.models[model];
  if (model) {
    let m = model;
    while (m.lastIndexOf('-') > 0) {
      m = m.slice(0, m.lastIndexOf('-'));
      if (pricing.models[m]) return pricing.models[m];
    }
  }
  return pricing.fallback ? (pricing.models[pricing.fallback] || null) : null;
}

function fmtUsdShort(n: number): string {
  if (!isFinite(n) || n === 0) return '$0';
  if (n < 0.005) return '<$0.01';
  if (n < 1) return '$' + n.toFixed(2);
  if (n < 100) return '$' + n.toFixed(1);
  return '$' + Math.round(n);
}

function fmtTokShort(n: number): string {
  if (!isFinite(n) || n === 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return (n / 1000).toFixed(0) + 'K';
  return (n / 1_000_000).toFixed(1) + 'M';
}

function renderTokensMiniChart(samples: ParsedSample[], s: TokensChartSettings, pricing: PricingTable | null): string {
  const W = 240, H = 96;
  const PAD = { top: 4, right: 4, bottom: 4, left: 4 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;

  const range = parseRange(s.days);
  if ('error' in range) {
    return `<div class="mini"><a href="command:claudeUsage.showTokens" class="mini-link" title="Open full tokens chart"><div class="mini-empty">Tokens chart settings: ${escapeHtml(range.error)}</div></a></div>`;
  }
  const nowMs = Date.now();
  let win = windowFromRange(range.startDay, range.endDay, nowMs);
  let fromMs = win.fromMs, toMs = win.toMs;

  // Only count turns that have token data; old log lines without tokens aren't useful here.
  const visible = samples
    .filter(p => {
      const t = new Date(p.ts).getTime();
      return t >= fromMs && t <= toMs && p.tokIn != null && p.tokOut != null && p.tokCacheCreate != null && p.tokCacheRead != null;
    })
    .map(p => ({ ...p, tsMs: new Date(p.ts).getTime() }));

  if (visible.length === 0) {
    return `<div class="mini"><a href="command:claudeUsage.showTokens" class="mini-link" title="Open full tokens chart"><div class="mini-empty">No token data in window</div></a></div>`;
  }

  // Apply Focus on data — same logic as the main tokens chart.
  if (s.focus && visible.length > 0) {
    const HOUR = 3600000;
    const minTs = visible[0].tsMs;
    const maxTs = visible[visible.length - 1].tsMs;
    fromMs = Math.max(fromMs, minTs - HOUR);
    toMs   = Math.min(toMs,   maxTs + HOUR);
  }

  const isUsd = s.yMode === 'usd' && pricing != null;
  const isLog = s.yMode === 'logTokens';

  // Per-turn 4-segment values in the active mode
  type Seg = { out: number; in_: number; cc: number; cr: number };
  const segVals: Seg[] = visible.map(p => {
    if (isUsd) {
      const price = lookupModelPrice(pricing, p.model);
      if (!price) return { out: 0, in_: 0, cc: 0, cr: 0 };
      return {
        out: (p.tokOut || 0) * price.output / 1_000_000,
        in_: (p.tokIn  || 0) * price.input  / 1_000_000,
        cc:  (p.tokCacheCreate || 0) * price.cache_write_5m / 1_000_000,
        cr:  (p.tokCacheRead   || 0) * price.cache_read     / 1_000_000,
      };
    }
    return {
      out: p.tokOut || 0,
      in_: p.tokIn  || 0,
      cc:  p.tokCacheCreate || 0,
      cr:  p.tokCacheRead   || 0,
    };
  });

  let totalSum = 0, maxStack = 0;
  for (const sv of segVals) {
    const stack = sv.out + sv.in_ + sv.cc + sv.cr;
    if (stack > maxStack) maxStack = stack;
    totalSum += stack;
  }

  const xOf = (ms: number) => PAD.left + ((ms - fromMs) / (toMs - fromMs)) * PW;
  let yScale: (v: number) => number;
  if (isLog) {
    const hiVal = Math.max(maxStack, 10);
    const hi = Math.log10(hiVal) + 0.05;
    yScale = (v) => {
      const y = v <= 0 ? 0 : Math.log10(v);
      const t = y / hi;
      return PAD.top + PH - Math.max(0, Math.min(1, t)) * PH;
    };
  } else {
    // Pick the upper bound from the actual data magnitude, not a fixed
    // floor of 1. In USD mode max-stack is often $0.20-$0.50 — flooring
    // to $1 squashed every bar to ~25% of the plot height. Round up to
    // the next nice 1/2/5 step so the visual matches the main chart.
    let top: number;
    if (maxStack <= 0) {
      top = 1;
    } else {
      const mag = Math.pow(10, Math.floor(Math.log10(maxStack)));
      const norm = maxStack / mag;
      const niceTop = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
      top = niceTop * mag;
    }
    yScale = (v) => PAD.top + PH - (Math.max(0, Math.min(top, v)) / top) * PH;
  }

  // Bar width: clamp to min inter-sample gap so clusters never overlap.
  let barW = 4;
  if (visible.length >= 2) {
    let minGapMs = Infinity;
    for (let i = 1; i < visible.length; i++) {
      const dt = visible[i].tsMs - visible[i - 1].tsMs;
      if (dt > 0 && dt < minGapMs) minGapMs = dt;
    }
    const winMs = toMs - fromMs;
    const minGapPx = minGapMs === Infinity ? PW : (minGapMs / winMs) * PW;
    barW = Math.max(0.6, Math.min(4, minGapPx * 0.85));
  }

  // Day-boundary verticals (only if more than one day shown)
  const DAY_MS = 86400000;
  let dayLines = '';
  if (toMs - fromMs > DAY_MS * 1.05) {
    const sod = new Date(fromMs);
    sod.setHours(0, 0, 0, 0);
    let bMs = sod.getTime() + DAY_MS;
    while (bMs < toMs) {
      const x = xOf(bMs).toFixed(1);
      dayLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="currentColor" stroke-width="0.5" stroke-dasharray="1 3" stroke-opacity="0.25"/>`;
      bMs += DAY_MS;
    }
  }

  const yBase = PAD.top + PH;
  const bars: string[] = [];
  for (let i = 0; i < visible.length; i++) {
    const p = visible[i];
    const sv = segVals[i];
    const cx = xOf(p.tsMs);
    if (isLog) {
      const drawLogBar = (v: number, color: string, slot: number) => {
        if (!v || v <= 0) return;
        const y = yScale(v);
        const w = Math.max(0.4, barW / 4);
        bars.push(`<rect x="${(cx - barW / 2 + slot * w).toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${(yBase - y).toFixed(2)}" fill="${color}" stroke="#1e1e1e" stroke-width="0.3"/>`);
      };
      drawLogBar(sv.out, TOKENS_COLORS.out, 0);
      drawLogBar(sv.in_, TOKENS_COLORS.in,  1);
      drawLogBar(sv.cc,  TOKENS_COLORS.cc,  2);
      drawLogBar(sv.cr,  TOKENS_COLORS.cr,  3);
    } else {
      let cum = 0;
      const segs: Array<[number, string]> = [
        [sv.out, TOKENS_COLORS.out],
        [sv.in_, TOKENS_COLORS.in],
        [sv.cc,  TOKENS_COLORS.cc],
        [sv.cr,  TOKENS_COLORS.cr],
      ];
      for (const [v, color] of segs) {
        if (v <= 0) continue;
        const y0 = yScale(cum);
        const y1 = yScale(cum + v);
        bars.push(`<rect x="${(cx - barW / 2).toFixed(2)}" y="${y1.toFixed(2)}" width="${barW.toFixed(2)}" height="${(y0 - y1).toFixed(2)}" fill="${color}" stroke="#1e1e1e" stroke-width="0.3"/>`);
        cum += v;
      }
    }
  }

  const labelText = isUsd ? fmtUsdShort(totalSum) : fmtTokShort(totalSum);
  const modeLabel = isUsd ? 'USD' : (s.yMode === 'logTokens' ? 'tokens (log)' : 'tokens');

  return `
    <div class="mini">
      <h2>Mini Tokens</h2>
      <a href="command:claudeUsage.showTokens" class="mini-link" title="Open full tokens chart">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="mini-svg">
          ${dayLines}
          ${bars.join('')}
          <text x="${W - 6}" y="14" text-anchor="end" font-size="10" font-family="var(--vscode-editor-font-family, monospace)" fill="currentColor">${escapeHtml(labelText)}</text>
          <text x="${W - 6}" y="26" text-anchor="end" font-size="9" font-family="var(--vscode-editor-font-family, monospace)" fill="currentColor" opacity="0.6">${escapeHtml(modeLabel)}</text>
        </svg>
      </a>
    </div>
  `;
}

