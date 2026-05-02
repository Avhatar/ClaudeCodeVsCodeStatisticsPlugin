import { UsageStats, ParsedSample } from './logSource';
import { ChartSettings, parseRange, windowFromRange, parseDur, midColor } from './chartLogic';

export interface ViewState {
  stats: UsageStats | null;
  error: { code: string; detail?: string } | null;
  lastFetchAt: string | null;
}

export function renderHtml(nonce: string, state: ViewState, samples: ParsedSample[], settings: ChartSettings): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

  let body: string;
  if (state.stats) {
    body = renderStats(state.stats) + renderMiniChart(samples, settings);
  } else if (state.error) {
    body = renderError(state.error);
  } else {
    body = renderLoading();
  }

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
  .mini-svg {
    width: 100%;
    height: 96px;
    background: var(--bar-bg);
    border: 1px solid var(--bar-border);
    border-radius: 6px;
    display: block;
  }
  .mini-empty {
    background: var(--bar-bg);
    border: 1px solid var(--bar-border);
    border-radius: 6px;
    padding: 22px 8px;
    text-align: center;
    color: var(--muted);
    font-size: 11px;
    font-style: italic;
  }
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
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderLoading(): string {
  return `<div class="empty">Fetching usage…</div>`;
}

function renderError(err: { code: string; detail?: string }): string {
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

function renderStats(s: UsageStats): string {
  const ts = new Date(s.fetchedAt);
  const tsLocal = isNaN(ts.getTime()) ? s.fetchedAt : ts.toLocaleTimeString();
  const staleNote = s.stale ? ` <span style="color: var(--warn, #facc15)">· stale (API unavailable)</span>` : '';
  return `
    ${renderTurnCard(s)}
    ${renderBar('5-Hour Limit', s.fiveHour.percent, s.fiveHour.delta, s.fiveHour.resetsIn)}
    ${renderBar('Weekly Limit', s.week.percent, s.week.delta, s.week.resetsIn)}
    <div class="meta">
      <div>Last fetched: <b>${escapeHtml(tsLocal)}</b>${staleNote}</div>
    </div>
  `;
}

function renderTurnCard(s: UsageStats): string {
  const d5 = s.fiveHour.delta;
  const dw = s.week.delta;
  const hasDelta = d5 != null || dw != null;

  if (!hasDelta) {
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
    `;
  }

  return `
    <h2>Last Turn (since previous fetch)</h2>
    <div class="turn-row">
      ${turnCard('5h Δ', d5)}
      ${turnCard('Week Δ', dw)}
    </div>
  `;
}

function turnCard(label: string, delta: number | null): string {
  if (delta == null) {
    return `
      <div class="turn-card">
        <div class="label">${escapeHtml(label)}</div>
        <span class="pct" style="color: var(--muted)">—</span>
        <div class="sub">no data</div>
      </div>
    `;
  }
  const color = delta > 0.005 ? 'var(--bad)' : delta < -0.005 ? 'var(--good)' : 'var(--muted)';
  const sub = delta > 0.005 ? 'consumed' : delta < -0.005 ? 'window reset' : 'no change';
  return `
    <div class="turn-card">
      <div class="label">${escapeHtml(label)}</div>
      <span class="pct" style="color: ${color}">${signed(delta)}%</span>
      <div class="sub">${sub}</div>
    </div>
  `;
}

function renderBar(label: string, percent: number, delta: number | null, resetsIn: string | null): string {
  const color = percent >= 80 ? 'var(--bad)' : percent >= 50 ? 'var(--warn)' : 'var(--good)';
  const w = Math.min(100, Math.max(0, percent));
  const deltaCls = delta == null ? '' : delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : '';
  const deltaTxt = delta == null ? '' : `Δ ${signed(delta)}% since last fetch`;
  return `
    <div class="card">
      <h2>${escapeHtml(label)}</h2>
      <div class="row">
        <span class="pct">${percent.toFixed(percent % 1 === 0 ? 0 : 2)}%</span>
        <span class="reset">${resetsIn ? '↻ ' + escapeHtml(resetsIn) : ''}</span>
      </div>
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
    return `<div class="mini"><div class="mini-empty">Chart settings: ${escapeHtml(range.error)}</div></div>`;
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
    return `<div class="mini"><div class="mini-empty">No data in window</div></div>`;
  }

  const xOf = (ms: number) => PAD.left + ((ms - win.fromMs) / (win.toMs - win.fromMs)) * PW;
  const yOf = (p: number) => PAD.top + PH - (Math.min(100, Math.max(0, p)) / 100) * PH;

  const fiveMid = midColor(s.fiveSat, s.fiveFade);
  const weekMid = midColor(s.weekSat, s.weekFade);
  const gapMs = s.gap * 60 * 60 * 1000;

  function pathFor(getY: (p: ParsedSample) => number): string {
    const segs: string[] = [];
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const x = xOf(p.tsMs).toFixed(1);
      const y = yOf(getY(p)).toFixed(1);
      const prev = visible[i - 1];
      const tooFar = prev && gapMs > 0 && (p.tsMs - prev.tsMs) > gapMs;
      const dropped = prev && s.breakOnReset && getY(p) < getY(prev);
      const breakHere = i === 0 || tooFar || dropped;
      segs.push((breakHere ? 'M' : 'L') + x + ' ' + y);
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
      dayLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="#ffffff" stroke-width="0.5" stroke-dasharray="1 3" stroke-opacity="0.25"/>`;
      bMs += DAY_MS;
    }
  }

  // Reset markers (actual + predicted)
  let resetLines = '';
  for (let i = 1; i < visible.length; i++) {
    const cur = visible[i], prev = visible[i - 1];
    const x = xOf(cur.tsMs).toFixed(1);
    if (cur.five < prev.five) {
      resetLines += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + PH}" stroke="${fiveMid}" stroke-width="0.7" stroke-dasharray="2 2" stroke-opacity="0.6"/>`;
    }
    if (cur.week < prev.week) {
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

  // Forecast (linear extrapolation)
  let forecastPath = '';
  if (s.forecast && visible.length >= 2) {
    function fcLine(getY: (p: ParsedSample) => number, color: string): string {
      const N = Math.min(5, visible.length);
      const last = visible[visible.length - 1];
      const first = visible[visible.length - N];
      const dt = last.tsMs - first.tsMs;
      const dy = getY(last) - getY(first);
      const yLast = getY(last);
      if (dt <= 0 || dy <= 0 || yLast >= 100) return '';
      const slope = dy / dt;
      const t100 = last.tsMs + (100 - yLast) / slope;
      const xEnd = Math.min(t100, win.toMs);
      if (xEnd <= last.tsMs) return '';
      const yEnd = Math.min(100, yLast + slope * (xEnd - last.tsMs));
      return `<line x1="${xOf(last.tsMs).toFixed(1)}" y1="${yOf(yLast).toFixed(1)}" x2="${xOf(xEnd).toFixed(1)}" y2="${yOf(yEnd).toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="3 2" stroke-opacity="0.7"/>`;
    }
    forecastPath += fcLine(p => p.week, 'url(#miniWeek)');
    forecastPath += fcLine(p => p.five, 'url(#miniFive)');
  }

  const gridStops = [25, 50, 75]
    .map(t => `<line x1="${PAD.left}" y1="${(yOf(t)).toFixed(1)}" x2="${PAD.left + PW}" y2="${(yOf(t)).toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`)
    .join('');

  return `
    <div class="mini">
      <h2>Mini Chart</h2>
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
        <path d="${pathFor(p => p.week)}" fill="none" stroke="url(#miniWeek)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${pathFor(p => p.five)}" fill="none" stroke="url(#miniFive)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        ${forecastPath}
      </svg>
    </div>
  `;
}

