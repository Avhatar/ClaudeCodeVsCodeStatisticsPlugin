import { ChartData } from './chart';
import { TokensChartSettings } from './chartLogic';

export function renderTokensHtml(nonce: string, data: ChartData, settings: TokensChartSettings): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');
  const settingsJson = JSON.stringify(settings).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  /* Locked dark palette by default — chart visuals were tuned for a dark
     backdrop. Toggle "Enable VS Code skin support" on the limits chart to
     switch this panel (and the sidebar mini charts) to body.theme-vscode
     overrides that follow the user's theme. Cost-tier colours stay fixed
     because their meaning ("output is most expensive" → red) shouldn't
     depend on the editor theme. */
  :root {
    --bg: #1e1e1e;
    --panel: #2a2a2a;
    --border: #3c3c3c;
    --text: #ddd;
    --muted: #999;
    --grid: rgba(255,255,255,0.06);
    --accent: #4aa7f7;
    --c-out: #ff5252;
    --c-in: #ff9c3c;
    --c-cc: #ffd23f;
    --c-cr: #3ddc97;
  }
  body.theme-vscode {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --panel: var(--vscode-editorWidget-background, #2a2a2a);
    --border: var(--vscode-widget-border, #3c3c3c);
    --text: var(--vscode-foreground, #ddd);
    --muted: var(--vscode-descriptionForeground, #999);
    --grid: rgba(127,127,127,0.18);
    --accent: var(--vscode-textLink-foreground, #4aa7f7);
  }
  body {
    font-family: var(--vscode-font-family);
    color: var(--text);
    margin: 0;
    padding: 18px 22px;
    background: var(--bg);
  }
  header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
  }
  h1 { font-size: 16px; margin: 0; font-weight: 600; }
  .controls { display: flex; gap: 14px; align-items: center; font-size: 12px; }
  .controls label { color: var(--muted); }
  input[type="number"], input[type="text"] {
    background: var(--panel); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 8px; font-family: inherit; font-size: 12px; width: 70px;
  }
  input:focus { outline: 1px solid var(--accent); outline-offset: -1px; }
  input.invalid { border-color: var(--c-out); }
  .legend { display: flex; gap: 14px; font-size: 11px; color: var(--muted); }
  .legend span::before {
    content: ''; display: inline-block; width: 10px; height: 10px;
    border-radius: 2px; margin-right: 6px; vertical-align: middle;
  }
  .legend .out::before { background: var(--c-out); }
  .legend .in::before  { background: var(--c-in); }
  .legend .cc::before  { background: var(--c-cc); }
  .legend .cr::before  { background: var(--c-cr); }
  .meta { font-size: 11px; color: var(--muted); margin-bottom: 10px; }
  .chart-wrap {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 6px; padding: 16px;
  }
  svg { width: 100%; height: auto; display: block; }
  .below {
    margin-top: 12px; font-size: 12px; color: var(--muted);
    display: flex; flex-direction: column; gap: 8px;
  }
  .below .row { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; }
  .below .ctl { display: inline-flex; align-items: center; gap: 4px; }
  .below input[type="checkbox"] { margin: 0 4px 0 0; }
  .below input[type="number"] { width: 60px; margin: 0 4px; }
  .axis text { fill: var(--muted); font-size: 10px; font-family: var(--vscode-editor-font-family, monospace); }
  .axis line.axis-line { stroke: var(--border); }
  .gridline { stroke: var(--grid); stroke-dasharray: 2,3; }
  .tooltip {
    position: absolute; pointer-events: none;
    background: var(--panel); border: 1px solid var(--border);
    padding: 6px 8px; border-radius: 4px;
    font-size: 11px; line-height: 1.5; white-space: nowrap;
    opacity: 0; transition: opacity 0.1s; z-index: 10;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .tooltip b { color: var(--text); }
  .tooltip .row { display: flex; justify-content: space-between; gap: 14px; }
  .tooltip .sw {
    display: inline-block; width: 8px; height: 8px;
    border-radius: 1px; margin-right: 6px; vertical-align: middle;
  }
  .bar-rect { stroke: #1e1e1e; stroke-width: 0.5; }
  .bar-group.is-hover .bar-rect {
    stroke: rgba(255, 255, 255, 0.85);
    stroke-width: 1;
  }
  #chart { cursor: crosshair; }
  .sel-info {
    margin-top: 10px; padding: 10px 14px;
    background: var(--panel); border: 1px solid #facc15;
    border-radius: 5px; font-size: 12px; line-height: 1.6;
  }
  .sel-info b { color: var(--text); }
  .sel-info .breakdown { color: var(--muted); font-size: 11px; margin-top: 4px; }
  .sel-info .hint { color: var(--muted); font-size: 10px; margin-left: 12px; }
  .pricing-note {
    margin-top: 14px; padding: 10px 12px;
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 5px; font-size: 11px; color: var(--muted); line-height: 1.55;
  }
  .pricing-note b { color: var(--text); }
  .pricing-note a { color: var(--accent); text-decoration: none; }
  .pricing-note a:hover { text-decoration: underline; }
  .pricing-note code {
    background: #1e1e1e; padding: 1px 5px; border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace); color: var(--text);
  }
</style>
</head>
<body>
<header>
  <h1>Claude Usage — Tokens</h1>
  <div class="controls">
    <div class="legend">
      <span class="out">output</span>
      <span class="in">input</span>
      <span class="cc">cache+</span>
      <span class="cr">cache-</span>
    </div>
    <label title="Day to show. Examples: 1 = today, 2 = yesterday, 7 = day 7 days ago. (3) = today + 2 days back. 1-7 = today through 7 days back.">Day: <input id="days" type="text" value="1" style="width: 100px;" /></label>
  </div>
</header>
<div class="meta" id="meta"></div>
<div class="chart-wrap">
  <svg id="chart" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet"></svg>
</div>
<div class="sel-info" id="selection" style="display:none"></div>
<div class="below">
  <div class="row">
    <span class="ctl">Break on gap &gt; <input id="gap" type="number" min="0" step="1" value="8" /> h</span>
    <span class="ctl">Y axis:
      <select id="yMode" style="background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font-family: inherit; font-size: 12px;">
        <option value="tokens">Tokens</option>
        <option value="logTokens">Tokens (log)</option>
        <option value="usd" selected>USD (cost)</option>
      </select>
    </span>
    <label class="ctl"><input id="focus" type="checkbox" checked /> Focus on data</label>
    <span style="margin-left:auto; font-size:11px; color:var(--muted)">Bars stack: out (bottom) → input → cache-create → cache-read (top)</span>
  </div>
</div>
<div class="pricing-note">
  <b>Cost calculation:</b> switch the <b>Y axis</b> control above to <code>USD (cost)</code>
  to see per-turn dollars stacked the same way as tokens. Prices come from
  <a href="command:claudeUsage.openPricingFile"><code>media/pricing.json</code></a>
  bundled with this extension. Anthropic publishes the canonical numbers at
  <a href="https://platform.claude.com/docs/en/about-claude/pricing">platform.claude.com/docs/en/about-claude/pricing</a>.
  Prices change rarely; when they do, ask your Claude agent in this workspace:
  <code>refresh media/pricing.json from https://platform.claude.com/docs/en/about-claude/pricing</code>,
  and rebuild the extension. Per-turn <code>model=…</code> is logged starting hook v0.24.0 — older lines
  fall back to the default model in the JSON. Cache writes are billed at the 5-minute rate
  (Claude Code's typical cache TTL); 1-hour cache pricing is not currently distinguished in the log.
</div>
<div class="tooltip" id="tooltip"></div>

<script nonce="${nonce}">
(function() {
  let data = ${dataJson};
  const svg = document.getElementById('chart');
  const meta = document.getElementById('meta');
  const tooltip = document.getElementById('tooltip');
  const daysInput = document.getElementById('days');
  const gapInput = document.getElementById('gap');
  const yModeInput = document.getElementById('yMode');
  const focusInput = document.getElementById('focus');
  const selInfo = document.getElementById('selection');

  // Drag-to-select state. activeSelection holds an absolute time range so
  // it stays meaningful across re-renders. currentVisible / currentScale
  // are stamped at the end of every render() so the mouseup handler and
  // updateSelInfo() can use them without reaching into closures.
  let activeSelection = null; // { fromMs, toMs }
  let currentVisible = [];
  let currentScale = { fromMs: 0, toMs: 1 };
  let dragState = null;       // { startX, rect }

  // globalState (baked in by the extension) is the durable layer — it
  // survives panel close/reopen. Per-panel setState applies on top so
  // edits during the same panel session take effect immediately.
  const vsApi = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
  const initial = ${settingsJson};
  daysInput.value = initial.days;
  gapInput.value = String(initial.gap);
  yModeInput.value = initial.yMode;
  focusInput.checked = !!initial.focus;
  const saved = vsApi ? (vsApi.getState() || {}) : {};
  if (saved.days) daysInput.value = saved.days;
  if (saved.gap)  gapInput.value = saved.gap;
  if (typeof saved.yMode === 'string') yModeInput.value = saved.yMode;
  // Migrate from older state shape that had a logScale boolean.
  else if (saved.logScale === true) yModeInput.value = 'logTokens';
  if (typeof saved.focus === 'boolean') focusInput.checked = saved.focus;
  function persist() {
    if (!vsApi) return;
    const settings = {
      days: daysInput.value,
      gap: parseFloat(gapInput.value) || 0,
      yMode: yModeInput.value,
      focus: focusInput.checked,
    };
    vsApi.setState(settings);
    // Mirror settings to the extension so the sidebar mini tokens chart
    // can pick up the same Day window / Y mode without drifting.
    vsApi.postMessage({ type: 'tokenSettings', settings });
  }

  const W = 800, H = 400;
  const PAD = { top: 16, right: 24, bottom: 38, left: 56 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const COLORS = { out: '#ff5252', in: '#ff9c3c', cc: '#ffd23f', cr: '#3ddc97' };

  function el(name, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear() { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ms, fmt) {
    const d = new Date(ms);
    const date = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    if (fmt === 'time') return time;
    if (fmt === 'date') return date;
    return date + ' ' + time;
  }
  function fmtTok(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n === 0) return '0';
    if (n < 1000) return String(Math.round(n));
    if (n < 1_000_000) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'K';
    return (n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1) + 'M';
  }
  function fmtUsd(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n === 0) return '$0';
    if (n < 0.005) return '<$0.01';
    if (n < 1) return '$' + n.toFixed(3).replace(/0+$/, '').replace(/\\.$/, '');
    if (n < 1000) return '$' + n.toFixed(2);
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  // Longest-prefix lookup against the bundled pricing table. data.pricing.models
  // is keyed by stripped model id (e.g. "claude-sonnet-4-5"); a turn that logged
  // model="claude-sonnet-4-7" falls back to "claude-sonnet-4-6" → "..-4-5" → "..-4"
  // → fallback. Returns the price entry, or null if no pricing is available.
  function lookupPrice(model) {
    if (!data.pricing || !data.pricing.models) return null;
    if (model && data.pricing.models[model]) return data.pricing.models[model];
    if (model) {
      let m = model;
      while (m.lastIndexOf('-') > 0) {
        m = m.slice(0, m.lastIndexOf('-'));
        if (data.pricing.models[m]) return data.pricing.models[m];
      }
    }
    const fb = data.pricing.fallback;
    return (fb && data.pricing.models[fb]) || null;
  }
  // Returns { out, in_, cc, cr, total } in USD, or null if pricing unavailable.
  function costForTurn(p) {
    const price = lookupPrice(p.model);
    if (!price) return null;
    const out = (p.tokOut || 0) * price.output / 1_000_000;
    const in_ = (p.tokIn  || 0) * price.input  / 1_000_000;
    // We can't tell 5m vs 1h cache writes from the log alone — use 5m which
    // covers the vast majority of Claude Code usage.
    const cc  = (p.tokCacheCreate || 0) * price.cache_write_5m / 1_000_000;
    const cr  = (p.tokCacheRead   || 0) * price.cache_read     / 1_000_000;
    return { out, in_, cc, cr, total: out + in_ + cc + cr };
  }

  function fmtSpan(fromMs, toMs) {
    const a = new Date(fromMs), b = new Date(toMs);
    const aDate = pad2(a.getMonth()+1) + '-' + pad2(a.getDate());
    const bDate = pad2(b.getMonth()+1) + '-' + pad2(b.getDate());
    const aTime = pad2(a.getHours()) + ':' + pad2(a.getMinutes());
    const bTime = pad2(b.getHours()) + ':' + pad2(b.getMinutes());
    if (aDate === bDate) return aDate + ' ' + aTime + '–' + bTime;
    return aDate + ' ' + aTime + ' → ' + bDate + ' ' + bTime;
  }
  function fmtDur(ms) {
    const sec = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 24) return Math.floor(h / 24) + 'd' + (h % 24) + 'h';
    if (h > 0)  return h + 'h' + (m ? m + 'm' : '');
    return m + 'm';
  }

  // Recompute selection summary from currentVisible against activeSelection.
  function updateSelInfo() {
    if (!activeSelection) { selInfo.style.display = 'none'; return; }
    const { fromMs, toMs } = activeSelection;
    const inSel = currentVisible.filter(p => p.tsMs >= fromMs && p.tsMs <= toMs);
    let totalIn = 0, totalOut = 0, totalCc = 0, totalCr = 0, totalUsd = 0;
    let costAvailable = false;
    for (const p of inSel) {
      totalIn  += p.tokIn  || 0;
      totalOut += p.tokOut || 0;
      totalCc  += p.tokCacheCreate || 0;
      totalCr  += p.tokCacheRead   || 0;
      const c = costForTurn(p);
      if (c) { totalUsd += c.total; costAvailable = true; }
    }
    const totalTok = totalIn + totalOut + totalCc + totalCr;
    const span = fmtSpan(fromMs, toMs);
    const dur = fmtDur(toMs - fromMs);
    const tokPart  = '<b>' + fmtTok(totalTok) + '</b> tokens';
    const costPart = costAvailable ? '  ·  <b>' + fmtUsd(totalUsd) + '</b>' : '';
    selInfo.innerHTML =
      '<div><b>Selection</b>  ·  ' + escapeHtml(String(inSel.length)) + ' turns  ·  ' +
      escapeHtml(span) + '  (' + escapeHtml(dur) + ')</div>' +
      '<div style="margin-top:4px">' + tokPart + costPart +
      '<span class="hint">drag again to redo · click outside / Esc to clear</span></div>' +
      '<div class="breakdown">out ' + fmtTok(totalOut) + ' / in ' + fmtTok(totalIn) +
      ' / c+ ' + fmtTok(totalCc) + ' / c- ' + fmtTok(totalCr) + '</div>';
    selInfo.style.display = 'block';
  }

  function clearSelection() {
    activeSelection = null;
    selInfo.style.display = 'none';
  }

  // Translate a clientX/clientY to viewBox coords. Handles preserveAspectRatio.
  function svgPointFromEvent(e) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const inv = ctm.inverse();
    const sp = pt.matrixTransform(inv);
    return { x: sp.x, y: sp.y };
  }
  function clampX(x) {
    return Math.max(PAD.left, Math.min(PAD.left + PW, x));
  }
  function timeFromX(x) {
    const t = (x - PAD.left) / PW;
    return currentScale.fromMs + t * (currentScale.toMs - currentScale.fromMs);
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // only left-click
    const sp = svgPointFromEvent(e);
    if (!sp) return;
    if (sp.x < PAD.left || sp.x > PAD.left + PW) return;
    if (sp.y < PAD.top  || sp.y > PAD.top  + PH) return;
    dragState = { startX: sp.x, rect: null };
    try { svg.setPointerCapture(e.pointerId); } catch {}
    hideTooltip();
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const sp = svgPointFromEvent(e);
    if (!sp) return;
    const x = clampX(sp.x);
    if (!dragState.rect) {
      dragState.rect = el('rect', {
        y: PAD.top, height: PH,
        fill: 'rgba(250, 204, 21, 0.10)',
        stroke: '#facc15', 'stroke-width': '1', 'stroke-dasharray': '4 2',
        'pointer-events': 'none',
      });
      svg.appendChild(dragState.rect);
    }
    const xL = Math.min(dragState.startX, x);
    const xR = Math.max(dragState.startX, x);
    dragState.rect.setAttribute('x', xL);
    dragState.rect.setAttribute('width', String(xR - xL));
  });
  svg.addEventListener('pointerup', (e) => {
    if (!dragState) return;
    const sp = svgPointFromEvent(e);
    const endX = sp ? clampX(sp.x) : dragState.startX;
    const xL = Math.min(dragState.startX, endX);
    const xR = Math.max(dragState.startX, endX);
    if (dragState.rect) { dragState.rect.remove(); dragState.rect = null; }
    dragState = null;
    if (xR - xL < 3) {
      // Treat as click — clear any selection.
      clearSelection();
      render();
      return;
    }
    activeSelection = { fromMs: timeFromX(xL), toMs: timeFromX(xR) };
    render();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeSelection) {
      clearSelection();
      render();
    }
  });
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function parseRange(input) {
    const raw = String(input == null ? '' : input);
    const s = raw
      .replace(/[\\uFF10-\\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
      .replace(/[^\\d()\\-]/g, '');
    if (!s) return { error: 'empty' };
    let m;
    m = /^(\\d+)-(\\d+)$/.exec(s);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (a < 1 || b < 1) return { error: 'days must be >= 1' };
      return { startDay: Math.max(a, b), endDay: Math.min(a, b) };
    }
    m = /^\\((\\d+)\\)$/.exec(s);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n < 1) return { error: 'N must be >= 1' };
      return { startDay: n, endDay: 1 };
    }
    const num = parseInt(s, 10);
    if (Number.isFinite(num) && String(num) === s) {
      if (num < 1) return { error: 'N must be >= 1' };
      return { startDay: num, endDay: num };
    }
    return { error: 'cannot parse: ' + JSON.stringify(raw) };
  }
  function windowFromRange(startDay, endDay, nowMs) {
    const sod = new Date(nowMs);
    sod.setHours(0, 0, 0, 0);
    const fromMs = sod.getTime() - (startDay - 1) * DAY_MS;
    const toMs = sod.getTime() - (endDay - 1) * DAY_MS + DAY_MS;
    return { fromMs, toMs, daysSpan: startDay - endDay + 1 };
  }

  function pickXTicks(fromMs, toMs) {
    const HOUR = 3600000;
    const dur = toMs - fromMs;
    const niceHours = [1, 2, 3, 4, 6, 12, 24, 48, 72, 168];
    let stepMs = HOUR;
    for (const h of niceHours) { if (dur / (h * HOUR) <= 7) { stepMs = h * HOUR; break; } }
    if (dur / stepMs > 7) stepMs = niceHours[niceHours.length - 1] * HOUR;
    const start = new Date(fromMs);
    if (stepMs >= 24 * HOUR) start.setHours(0, 0, 0, 0);
    else start.setMinutes(0, 0, 0);
    let t0 = start.getTime();
    while (t0 < fromMs) t0 += stepMs;
    const ticks = [];
    for (let t = t0; t <= toMs; t += stepMs) {
      const d = new Date(t);
      const label = stepMs >= 24 * HOUR
        ? pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
        : (dur > 24 * HOUR
            ? pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
            : pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
      ticks.push({ ms: t, label });
    }
    return ticks;
  }

  // For linear scale, pick ~5 nice round Y ticks up to maxV.
  function pickYTicks(maxV) {
    if (maxV <= 0) return { ticks: [0], top: 1 };
    const targetCount = 5;
    const rawStep = maxV / targetCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    let step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3.5) step = 2 * mag;
    else if (norm < 7.5) step = 5 * mag;
    else step = 10 * mag;
    const top = Math.ceil(maxV / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
    return { ticks, top };
  }

  function showMessage(lines) {
    const fo = el('foreignObject', { x: 40, y: 40, width: W - 80, height: H - 80 });
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.style.cssText = 'color: var(--muted); font-family: var(--vscode-font-family); font-size: 13px; line-height: 1.6; padding: 12px;';
    div.innerHTML = lines.join('');
    fo.appendChild(div);
    svg.appendChild(fo);
  }

  function positionTooltip(pageX, pageY) {
    // Default offset to the lower-right of the cursor; if the tooltip would
    // run past the visible viewport on either axis, flip to the opposite
    // side. offsetWidth/Height force a sync reflow which is what we want
    // here — we need the measured size right now to compute the flip.
    const margin = 8;
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    const right  = window.scrollX + window.innerWidth;
    const bottom = window.scrollY + window.innerHeight;
    let left = pageX + 12, top = pageY + 12;
    if (left + w + margin > right)  left = Math.max(window.scrollX + margin, pageX - w - 12);
    if (top  + h + margin > bottom) top  = Math.max(window.scrollY + margin, pageY - h - 12);
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  }
  function showTooltip(evt, html) {
    if (dragState) return; // suppress while drag-selecting
    tooltip.innerHTML = html;
    tooltip.style.opacity = '1';
    positionTooltip(evt.pageX, evt.pageY);
  }
  function hideTooltip() { tooltip.style.opacity = '0'; }

  function render() {
    // Theme follows the limits-chart's vscodeSkin setting (piggy-backed on
    // ChartData since the tokens panel doesn't have its own toggle).
    document.body.classList.toggle('theme-vscode', !!(data && data.vscodeSkin));
    clear();
    daysInput.classList.remove('invalid');
    const range = parseRange(daysInput.value);
    if (range.error) {
      daysInput.classList.add('invalid');
      meta.textContent = 'Input error: ' + range.error;
      showMessage([
        '<b style="color: var(--c-out)">Invalid range: ' + escapeHtml(range.error) + '</b>',
        '<p style="margin-top:14px"><b>Day numbering</b>: 1 = today, 2 = yesterday, N = (N−1) days ago.</p>',
        '<p><b>Syntax:</b></p>',
        '<ul style="margin: 4px 0 0 18px; padding: 0;">',
        '<li><code>1</code> &mdash; today only</li>',
        '<li><code>(3)</code> &mdash; today + 2 days back, inclusive</li>',
        '<li><code>1-7</code> &mdash; today through 6 days back</li>',
        '</ul>',
      ]);
      return;
    }
    const gapHours = Math.max(0, parseFloat(gapInput.value) || 0);
    const gapMs = gapHours * 60 * 60 * 1000;
    const yMode = yModeInput.value;
    const isUsd = yMode === 'usd';
    const isLog = yMode === 'logTokens';
    if (isUsd && (!data.pricing || !data.pricing.models)) {
      // pricing.json missing — fall back to tokens linear so we don't render an empty chart.
      yModeInput.value = 'tokens';
    }
    const fmtY = isUsd ? fmtUsd : fmtTok;
    const nowMs = Date.now();
    const win = windowFromRange(range.startDay, range.endDay, nowMs);
    let fromMs = win.fromMs, toMs = win.toMs;
    let days = win.daysSpan;

    const visible = data.samples.filter(s =>
      s.tsMs >= fromMs && s.tsMs <= toMs &&
      s.tokIn != null && s.tokOut != null && s.tokCacheCreate != null && s.tokCacheRead != null
    );

    if (focusInput.checked && visible.length > 0) {
      const HOUR = 3600000;
      const minTs = visible[0].tsMs;
      const maxTs = visible[visible.length - 1].tsMs;
      fromMs = Math.max(fromMs, minTs - HOUR);
      toMs   = Math.min(toMs,   maxTs + HOUR);
      days   = (toMs - fromMs) / 86400000;
    }

    // Stash for the drag-selection handlers (which run outside render scope).
    currentVisible = visible;
    currentScale = { fromMs, toMs };
    // Drop selection that no longer overlaps the visible window.
    if (activeSelection &&
        (activeSelection.toMs < fromMs || activeSelection.fromMs > toMs)) {
      clearSelection();
    }

    // Per-turn segment values in the active Y mode. Tokens mode: raw counts.
    // USD mode: each segment in dollars. We compute USD up-front so the rest
    // of the render code stays mode-agnostic.
    const segVals = new Array(visible.length);
    let totalSum = 0, outS = 0, inS = 0, ccS = 0, crS = 0;
    let maxStack = 0;
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      let segOut, segIn, segCc, segCr;
      if (isUsd) {
        const c = costForTurn(p);
        if (c) { segOut = c.out; segIn = c.in_; segCc = c.cc; segCr = c.cr; }
        else   { segOut = 0; segIn = 0; segCc = 0; segCr = 0; }
      } else {
        segOut = p.tokOut || 0;
        segIn  = p.tokIn  || 0;
        segCc  = p.tokCacheCreate || 0;
        segCr  = p.tokCacheRead   || 0;
      }
      segVals[i] = { out: segOut, in_: segIn, cc: segCc, cr: segCr };
      const stack = segOut + segIn + segCc + segCr;
      if (stack > maxStack) maxStack = stack;
      outS += segOut; inS += segIn; ccS += segCc; crS += segCr;
      totalSum += stack;
    }

    function rangeLabel() {
      if (range.startDay === range.endDay) {
        const d = new Date(fromMs);
        const dateStr = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
        if (range.startDay === 1) return 'Today (' + dateStr + ')';
        if (range.startDay === 2) return 'Yesterday (' + dateStr + ')';
        return 'Day ' + range.startDay + ' (' + dateStr + ')';
      }
      return 'Days ' + range.endDay + '–' + range.startDay;
    }
    const focusNote = focusInput.checked && visible.length > 0 ? '  ·  focused' : '';
    const pricingNote = (isUsd && data.pricing && data.pricing._updated)
      ? '  ·  prices ' + data.pricing._updated
      : '';
    meta.textContent =
      rangeLabel() +
      '  ·  turns: ' + visible.length +
      '  ·  total: ' + fmtY(totalSum) +
      '  ·  out ' + fmtY(outS) +
      ' / in ' + fmtY(inS) +
      ' / c+ ' + fmtY(ccS) +
      ' / c- ' + fmtY(crS) +
      pricingNote +
      focusNote;

    function xOf(ms) { return PAD.left + ((ms - fromMs) / (toMs - fromMs)) * PW; }

    let yScale;
    let yTickList;
    if (isLog) {
      const hiVal = Math.max(maxStack, 10);
      const hi = Math.log10(hiVal) + 0.05;
      yScale = (v) => {
        const y = v <= 0 ? 0 : Math.log10(v);
        const t = (y - 0) / (hi - 0);
        return PAD.top + PH - Math.max(0, Math.min(1, t)) * PH;
      };
      const ticks = [];
      const topPow = Math.ceil(hi);
      for (let p = 0; p <= topPow; p++) {
        const v = Math.pow(10, p);
        if (v > hiVal * 1.5) break;
        ticks.push(v);
      }
      yTickList = ticks;
    } else {
      const yt = pickYTicks(maxStack);
      const top = yt.top || Math.max(maxStack, 1);
      yScale = (v) => PAD.top + PH - (Math.max(0, Math.min(top, v)) / top) * PH;
      yTickList = yt.ticks;
    }

    // Y axis
    const gY = el('g', { class: 'axis' });
    gY.appendChild(el('line', { class: 'axis-line', x1: PAD.left, y1: PAD.top, x2: PAD.left, y2: PAD.top + PH }));
    for (const v of yTickList) {
      const y = yScale(v);
      gY.appendChild(el('line', { class: 'gridline', x1: PAD.left, y1: y, x2: PAD.left + PW, y2: y }));
      const txt = el('text', { x: PAD.left - 6, y: y + 3, 'text-anchor': 'end' });
      txt.textContent = fmtY(v);
      gY.appendChild(txt);
    }
    svg.appendChild(gY);

    // X axis
    const gX = el('g', { class: 'axis' });
    gX.appendChild(el('line', { class: 'axis-line', x1: PAD.left, y1: PAD.top + PH, x2: PAD.left + PW, y2: PAD.top + PH }));
    const xTicks = pickXTicks(fromMs, toMs);
    for (const tk of xTicks) {
      const x = xOf(tk.ms);
      gX.appendChild(el('line', { class: 'gridline', x1: x, y1: PAD.top, x2: x, y2: PAD.top + PH }));
      const lbl = el('text', { x: x, y: PAD.top + PH + 16, 'text-anchor': 'middle' });
      lbl.textContent = tk.label;
      gX.appendChild(lbl);
    }
    svg.appendChild(gX);

    // Day boundary verticals (more than one day shown)
    if (days > 1) {
      const sod = new Date(fromMs);
      sod.setHours(0, 0, 0, 0);
      let bMs = sod.getTime() + DAY_MS;
      while (bMs < toMs) {
        const x = xOf(bMs);
        svg.appendChild(el('line', {
          x1: x, y1: PAD.top, x2: x, y2: PAD.top + PH,
          stroke: 'currentColor', 'stroke-width': '1', 'stroke-dasharray': '2 4', 'stroke-opacity': '0.3',
        }));
        bMs += DAY_MS;
      }
    }

    if (!visible.length) {
      showMessage([
        '<b style="color: var(--muted)">No token data for ' + escapeHtml(rangeLabel()) + '.</b>',
        '<p style="margin-top:10px">Either no turns happened in this window, or the log lines predate the per-turn token block.</p>',
      ]);
      return;
    }

    // Bar width: aim for 8 px, but never wider than the *minimum* gap between
    // adjacent samples in the visible window. Using avg spacing here was wrong
    // — in clusters the actual spacing is much tighter than the average and
    // bars ended up overlapping. Min-gap guarantees no overlap; sparse regions
    // just look the same as dense ones (uniform visual rhythm).
    let barW = 6;
    if (visible.length >= 2) {
      let minGapMs = Infinity;
      for (let i = 1; i < visible.length; i++) {
        const dt = visible[i].tsMs - visible[i - 1].tsMs;
        if (dt > 0 && dt < minGapMs) minGapMs = dt;
      }
      const winMs = toMs - fromMs;
      const minGapPx = minGapMs === Infinity ? PW : (minGapMs / winMs) * PW;
      barW = Math.max(1, Math.min(8, minGapPx * 0.85));
    }

    // Gap markers (vertical dotted lines where time gap > N hours)
    if (gapMs > 0) {
      for (let i = 1; i < visible.length; i++) {
        const dt = visible[i].tsMs - visible[i - 1].tsMs;
        if (dt > gapMs) {
          const xMid = (xOf(visible[i].tsMs) + xOf(visible[i - 1].tsMs)) / 2;
          svg.appendChild(el('line', {
            x1: xMid, y1: PAD.top, x2: xMid, y2: PAD.top + PH,
            stroke: '#888', 'stroke-width': '1', 'stroke-dasharray': '1 4', 'stroke-opacity': '0.35',
          }));
        }
      }
    }

    // Stacked bars in linear/USD modes; 4 side-by-side micro-bars in log mode
    // (stacking on a log axis looks visually misleading because the heights
    // aren't additive in log space).
    // Tooltips are not bound to bar rects directly — at high turn density
    // bars are 1 px wide and impossible to hit. Instead we draw bars with no
    // pointer-events, then in a second pass put a transparent full-height
    // "hit area" rect per turn covering the cell from the previous turn's
    // midpoint to the next turn's midpoint (Voronoi-style).
    const yBase = PAD.top + PH;
    const tips = new Array(visible.length);
    const barGroups = new Array(visible.length);
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const sv = segVals[i];
      const cx = xOf(p.tsMs);
      const x0 = cx - barW / 2;
      const cost = costForTurn(p);
      const tokTotal = (p.tokOut||0)+(p.tokIn||0)+(p.tokCacheCreate||0)+(p.tokCacheRead||0);
      const modelLine = p.model
        ? '<div class="row" style="color:var(--muted);font-size:10px"><span>model</span><b>' + escapeHtml(p.model) + '</b></div>'
        : '';
      tips[i] =
        '<div class="row"><b>' + fmtTime(p.tsMs, 'both') + '</b></div>' +
        modelLine +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.out + '"></span>output</span><b>' + fmtTok(p.tokOut) + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.out) + '</span>' : '') + '</b></div>' +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.in  + '"></span>input</span><b>'  + fmtTok(p.tokIn)  + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.in_) + '</span>' : '') + '</b></div>' +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.cc  + '"></span>cache+</span><b>'  + fmtTok(p.tokCacheCreate) + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.cc) + '</span>' : '') + '</b></div>' +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.cr  + '"></span>cache-</span><b>'  + fmtTok(p.tokCacheRead) + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.cr) + '</span>' : '') + '</b></div>' +
        '<div class="row" style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px"><span>tokens</span><b>' + fmtTok(tokTotal) + '</b></div>' +
        (cost ? '<div class="row"><span>cost</span><b>' + fmtUsd(cost.total) + '</b></div>' : '');

      // Group all rects of this turn so the hit-area can toggle a single
      // class to highlight every segment at once via CSS.
      const group = el('g', { class: 'bar-group' });
      barGroups[i] = group;
      if (isLog) {
        function drawLogBar(v, color, slot) {
          if (!v || v <= 0) return;
          const y = yScale(v);
          const w = Math.max(1, barW / 4);
          const r = el('rect', {
            class: 'bar-rect',
            x: cx - barW / 2 + slot * w,
            y: y, width: w, height: yBase - y,
            fill: color,
            'pointer-events': 'none',
          });
          group.appendChild(r);
        }
        drawLogBar(sv.out, COLORS.out, 0);
        drawLogBar(sv.in_, COLORS.in,  1);
        drawLogBar(sv.cc,  COLORS.cc,  2);
        drawLogBar(sv.cr,  COLORS.cr,  3);
      } else {
        let cum = 0;
        const segs = [
          [sv.out, COLORS.out],
          [sv.in_, COLORS.in],
          [sv.cc,  COLORS.cc],
          [sv.cr,  COLORS.cr],
        ];
        for (const [v, color] of segs) {
          if (v <= 0) continue;
          const y0 = yScale(cum);
          const y1 = yScale(cum + v);
          const r = el('rect', {
            class: 'bar-rect',
            x: x0, y: y1, width: barW, height: y0 - y1,
            fill: color,
            'pointer-events': 'none',
          });
          group.appendChild(r);
          cum += v;
        }
      }
      svg.appendChild(group);
    }

    // Per-turn hit-area: x-extent from midpoint to previous turn to midpoint
    // to next turn, but capped at MAX_HALF_PX on each side so a sparse chart
    // doesn't make the hit zone span hours of empty space. Full plot height.
    // pointer-events:all on a transparent fill so mouseenter still fires.
    // pointerdown bubbles to the SVG so drag-to-select keeps working.
    const MAX_HALF_PX = 20;
    for (let i = 0; i < visible.length; i++) {
      const cx = xOf(visible[i].tsMs);
      const prevX = i > 0 ? xOf(visible[i - 1].tsMs) : null;
      const nextX = i < visible.length - 1 ? xOf(visible[i + 1].tsMs) : null;
      const halfL = prevX != null ? Math.min(MAX_HALF_PX, (cx - prevX) / 2) : MAX_HALF_PX;
      const halfR = nextX != null ? Math.min(MAX_HALF_PX, (nextX - cx) / 2) : MAX_HALF_PX;
      const hit = el('rect', {
        x: cx - halfL, y: PAD.top, width: halfL + halfR, height: PH,
        fill: 'transparent', 'pointer-events': 'all',
      });
      const tip = tips[i];
      const group = barGroups[i];
      hit.addEventListener('mouseenter', (e) => {
        showTooltip(e, tip);
        if (group) group.classList.add('is-hover');
      });
      hit.addEventListener('mouseleave', () => {
        hideTooltip();
        if (group) group.classList.remove('is-hover');
      });
      svg.appendChild(hit);
    }

    // Selection overlay: drawn last so it sits on top of the bars. Rect lives
    // inside the chart plot area only; clamped to fromMs/toMs so a selection
    // that partly fell outside the new window after a Day change still shows
    // the part that's still in view.
    if (activeSelection) {
      const sFrom = Math.max(activeSelection.fromMs, fromMs);
      const sTo   = Math.min(activeSelection.toMs,   toMs);
      if (sTo > sFrom) {
        const xL = xOf(sFrom);
        const xR = xOf(sTo);
        svg.appendChild(el('rect', {
          x: xL, y: PAD.top, width: xR - xL, height: PH,
          fill: 'rgba(250, 204, 21, 0.10)',
          stroke: '#facc15', 'stroke-width': '1', 'stroke-dasharray': '4 2',
          'pointer-events': 'none',
        }));
      }
      updateSelInfo();
    } else {
      selInfo.style.display = 'none';
    }
  }

  // No initial persist() — defaults come from globalState via the baked-in
  // initial object, and persisting on a fresh panel would overwrite saved
  // settings with HTML defaults whenever setState was empty.

  function onChange() { clearSelection(); persist(); render(); }
  [daysInput, gapInput, yModeInput, focusInput].forEach(inp => {
    inp.addEventListener('input', onChange);
    inp.addEventListener('change', onChange);
  });
  document.addEventListener('mousemove', (e) => {
    if (tooltip.style.opacity === '1') {
      positionTooltip(e.pageX, e.pageY);
    }
  });
  window.addEventListener('message', (e) => {
    const msg = e && e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'data' && msg.data && Array.isArray(msg.data.samples)) {
      data = msg.data;
      render();
    }
  });

  render();
})();
</script>
</body>
</html>`;
}
