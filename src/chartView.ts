import { ChartData } from './chart';

export function renderChartHtml(nonce: string, data: ChartData): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  /* Locked dark palette by default — chart visuals (white day-boundary dashes,
     low-alpha white grid, gradient strokes) were tuned for a dark backdrop and
     can be unreadable on a light VS Code theme. The "Enable VS Code skin
     support" toggle in the options below switches to body.theme-vscode which
     overrides these vars with --vscode-* tokens; users opting in accept the
     trade-off that some elements are still tuned for dark.
     Fonts always follow the user's VS Code settings. */
  :root {
    --bg: #1e1e1e;
    --panel: #2a2a2a;
    --border: #3c3c3c;
    --text: #ddd;
    --muted: #999;
    --grid: rgba(255,255,255,0.06);
    --five: #f87171;
    --week: #4aa7f7;
  }
  body.theme-vscode {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --panel: var(--vscode-editorWidget-background, #2a2a2a);
    --border: var(--vscode-widget-border, #3c3c3c);
    --text: var(--vscode-foreground, #ddd);
    --muted: var(--vscode-descriptionForeground, #999);
    --grid: rgba(127,127,127,0.18);
  }
  body {
    font-family: var(--vscode-font-family);
    color: var(--text);
    margin: 0;
    padding: 18px 22px;
    background: var(--bg);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 10px;
  }
  h1 { font-size: 16px; margin: 0; font-weight: 600; }
  .controls {
    display: flex;
    gap: 14px;
    align-items: center;
    font-size: 12px;
  }
  .controls label { color: var(--muted); }
  input[type="number"], input[type="text"] {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 8px;
    font-family: inherit;
    font-size: 12px;
    width: 70px;
  }
  input:focus {
    outline: 1px solid var(--week);
    outline-offset: -1px;
  }
  input.invalid { border-color: var(--five); }
  .legend { display: flex; gap: 14px; font-size: 11px; color: var(--muted); }
  .legend span::before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 6px;
    vertical-align: middle;
  }
  .legend .five::before { background: var(--five); }
  .legend .week::before { background: var(--week); }
  .meta { font-size: 11px; color: var(--muted); margin-bottom: 10px; }
  .chart-wrap {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
  }
  svg { width: 100%; height: auto; display: block; }
  .below {
    margin-top: 12px;
    font-size: 12px;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .below .row {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
  }
  .below .ctl { display: inline-flex; align-items: center; gap: 4px; }
  .below input[type="checkbox"] { margin: 0 4px 0 0; }
  .below input[type="number"] {
    width: 60px;
    margin: 0 4px;
  }
  .below input[type="color"] {
    width: 26px;
    height: 22px;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }
  .reset-btn {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .reset-btn:hover { background: var(--border); }
  .axis text { fill: var(--muted); font-size: 10px; font-family: var(--vscode-editor-font-family, monospace); }
  .axis line.axis-line { stroke: var(--border); }
  .gridline { stroke: var(--grid); stroke-dasharray: 2,3; }
  .point-group.is-hover circle {
    stroke: var(--text);
    stroke-width: 2;
    r: 4.5;
  }
  .tooltip {
    position: absolute;
    pointer-events: none;
    background: var(--panel);
    border: 1px solid var(--border);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 1.4;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.1s;
    z-index: 10;
  }
  .tooltip b { color: var(--text); }
  #chart { cursor: crosshair; }
  .sel-info {
    margin-top: 10px; padding: 10px 14px;
    background: var(--panel); border: 1px solid #facc15;
    border-radius: 5px; font-size: 12px; line-height: 1.6;
  }
  .sel-info b { color: var(--text); }
  .sel-info .hint { color: var(--muted); font-size: 10px; margin-left: 12px; }
</style>
</head>
<body>
<header>
  <h1>Claude Usage — Chart</h1>
  <div class="controls">
    <div class="legend">
      <span class="five">5-hour</span>
      <span class="week">Weekly</span>
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
    <span class="ctl">Break line on gap &gt; <input id="gap" type="number" min="0" step="1" value="8" /> h</span>
    <label class="ctl"><input id="breakOnReset" type="checkbox" checked /> Break on reset limit</label>
    <label class="ctl"><input id="forecast" type="checkbox" /> Forecast</label>
    <label class="ctl"><input id="focus" type="checkbox" /> Focus on data</label>
  </div>
  <div class="row">
    <span class="ctl">5-hour gradient: 0%
      <input id="fiveSat"  type="color" value="#ff0000" title="5h color at 0% used (saturated)"/>
      →
      <input id="fiveFade" type="color" value="#ffc2c2" title="5h color at 100% used (faded)"/>
    100%</span>
    <span class="ctl">Weekly gradient: 0%
      <input id="weekSat"  type="color" value="#2499ff" title="weekly color at 0% used (saturated)"/>
      →
      <input id="weekFade" type="color" value="#a8cfff" title="weekly color at 100% used (faded)"/>
    100%</span>
    <button id="resetColors" type="button" class="reset-btn" title="Reset gradients to default colors">Reset colors</button>
  </div>
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
  const fiveSatInput = document.getElementById('fiveSat');
  const fiveFadeInput = document.getElementById('fiveFade');
  const weekSatInput = document.getElementById('weekSat');
  const weekFadeInput = document.getElementById('weekFade');
  const breakOnResetInput = document.getElementById('breakOnReset');
  const forecastInput = document.getElementById('forecast');
  const focusInput = document.getElementById('focus');
  const selInfo = document.getElementById('selection');

  // Drag-to-select state. activeSelection is in absolute time so it stays
  // valid across re-renders. currentVisible / currentScale are stamped
  // at the end of every render() so the mouseup handler and updateSelInfo()
  // can read them without reaching into the render closure.
  let activeSelection = null; // { fromMs, toMs }
  let currentVisible = [];
  let currentScale = { fromMs: 0, toMs: 1 };
  let dragState = null;       // { startX, rect }

  // Persist user's choices in webview state so they survive panel reloads.
  const vsApi = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
  const saved = vsApi ? (vsApi.getState() || {}) : {};
  if (saved.days)     daysInput.value = saved.days;
  if (saved.gap)      gapInput.value = saved.gap;
  if (saved.fiveSat)  fiveSatInput.value = saved.fiveSat;
  if (saved.fiveFade) fiveFadeInput.value = saved.fiveFade;
  if (saved.weekSat)  weekSatInput.value = saved.weekSat;
  if (saved.weekFade) weekFadeInput.value = saved.weekFade;
  if (typeof saved.breakOnReset === 'boolean') breakOnResetInput.checked = saved.breakOnReset;
  if (typeof saved.forecast === 'boolean') forecastInput.checked = saved.forecast;
  if (typeof saved.focus === 'boolean') focusInput.checked = saved.focus;
  // Theme follows ChartSettings.vscodeSkin, which the sidebar's Settings
  // dropdown owns now. Each render re-applies the body class from data.vscodeSkin
  // so a toggle in the sidebar is reflected here without a panel reload.
  function applyTheme() {
    document.body.classList.toggle('theme-vscode', !!(data && data.vscodeSkin));
  }
  applyTheme();
  function persist() {
    if (!vsApi) return;
    const settings = {
      days: daysInput.value,
      gap: parseFloat(gapInput.value) || 0,
      fiveSat: fiveSatInput.value,
      fiveFade: fiveFadeInput.value,
      weekSat: weekSatInput.value,
      weekFade: weekFadeInput.value,
      breakOnReset: breakOnResetInput.checked,
      forecast: forecastInput.checked,
      focus: focusInput.checked,
    };
    vsApi.setState(settings);
    vsApi.postMessage({ type: 'settings', settings });
  }

  const W = 800, H = 400;
  const PAD = { top: 16, right: 24, bottom: 38, left: 44 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function el(name, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function clear() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function positionTooltip(pageX, pageY) {
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

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDateTime(ms, fmt) {
    const d = new Date(ms);
    const date = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (fmt === 'time') return time;
    if (fmt === 'date') return date;
    return date + ' ' + time;
  }

  // (windowStartMs replaced by parseRange + windowFromRange below)
  // Day numbering: 1 = today, 2 = yesterday, N = N-1 days ago.
  // Returns { error } on bad input, or { startDay, endDay } where startDay is
  // the older boundary (larger N) and endDay is the newer (smaller N).
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
    const codes = Array.from(raw).map(c => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
    return { error: 'cannot parse: ' + JSON.stringify(raw) + ' [hex: ' + codes + ']' };
  }

  function windowFromRange(startDay, endDay, nowMs) {
    const sod = new Date(nowMs);
    sod.setHours(0, 0, 0, 0);
    const fromMs = sod.getTime() - (startDay - 1) * DAY_MS;
    // Always show full days, including the rest of "today" — gives forecast
    // and trends room to extend to the right edge.
    const toMs = sod.getTime() - (endDay - 1) * DAY_MS + DAY_MS;
    return { fromMs, toMs, daysSpan: startDay - endDay + 1 };
  }

  function rangeLabel(startDay, endDay, fromMs, toMs) {
    if (startDay === endDay) {
      const d = new Date(fromMs);
      const dateStr = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      if (startDay === 1) return 'Today (' + dateStr + ')';
      if (startDay === 2) return 'Yesterday (' + dateStr + ')';
      return 'Day ' + startDay + ' (' + dateStr + ')';
    }
    return 'Days ' + endDay + '–' + startDay + '  ·  ' + fmtDateTime(fromMs, 'date') + ' → ' + fmtDateTime(toMs, 'date');
  }

  function pickXTicks(fromMs, toMs) {
    const HOUR = 3600000;
    const dur = toMs - fromMs;
    const niceHours = [1, 2, 3, 4, 6, 12, 24, 48, 72, 168];
    let stepMs = HOUR;
    for (const h of niceHours) {
      if (dur / (h * HOUR) <= 7) { stepMs = h * HOUR; break; }
    }
    if (dur / stepMs > 7) stepMs = niceHours[niceHours.length - 1] * HOUR;
    const start = new Date(fromMs);
    if (stepMs >= 24 * HOUR) start.setHours(0, 0, 0, 0);
    else { start.setMinutes(0, 0, 0); }
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

  function showMessage(lines) {
    const fo = el('foreignObject', { x: 40, y: 40, width: W - 80, height: H - 80 });
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.style.cssText = 'color: var(--muted); font-family: var(--vscode-font-family); font-size: 13px; line-height: 1.6; padding: 12px;';
    div.innerHTML = lines.join('');
    fo.appendChild(div);
    svg.appendChild(fo);
  }

  function renderRulesError(reason) {
    clear();
    daysInput.classList.add('invalid');
    meta.textContent = 'Input error: ' + reason;
    showMessage([
      '<b style="color: var(--five)">Invalid range: ' + escapeHtml(reason) + '</b>',
      '<p style="margin-top:14px"><b>Day numbering</b>: 1 = today, 2 = yesterday, N = (N−1) days ago.</p>',
      '<p><b>Syntax:</b></p>',
      '<ul style="margin: 4px 0 0 18px; padding: 0;">',
      '<li><code>1</code> &mdash; today only (default)</li>',
      '<li><code>2</code> &mdash; only yesterday (one day, fully)</li>',
      '<li><code>7</code> &mdash; only that one day, 6 days ago</li>',
      '<li><code>(3)</code> &mdash; today + 2 days back, inclusive</li>',
      '<li><code>1-2</code> &mdash; today through yesterday (same as <code>(2)</code>)</li>',
      '<li><code>3-7</code> &mdash; from 6 days ago through 2 days ago</li>',
      '</ul>',
    ]);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  function fmtSigned(n) {
    if (n == null || !isFinite(n)) return '—';
    if (Math.abs(n) < 0.005) return '+0%';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  // Recompute selection summary from currentVisible against activeSelection.
  // Sums the per-turn deltas (5h, week) over the selected range — so picking
  // 3 turns of +1%, +5%, +10% gives "+16%". Resets show up as negative deltas
  // and still contribute to the signed sum; the meta line tags them so the
  // user knows why a number went down.
  function updateSelInfo() {
    if (!activeSelection) { selInfo.style.display = 'none'; return; }
    const { fromMs, toMs } = activeSelection;
    const inSel = currentVisible.filter(p => p.tsMs >= fromMs && p.tsMs <= toMs);
    let sum5 = 0, sumW = 0, hasResetIn = false, hasResetWk = false;
    let n5 = 0, nw = 0;
    for (const p of inSel) {
      if (typeof p.fiveDelta === 'number' && isFinite(p.fiveDelta)) {
        sum5 += p.fiveDelta; n5++;
        if (p.fiveDelta < -0.005) hasResetIn = true;
      }
      if (typeof p.weekDelta === 'number' && isFinite(p.weekDelta)) {
        sumW += p.weekDelta; nw++;
        if (p.weekDelta < -0.005) hasResetWk = true;
      }
    }
    const span = fmtSpan(fromMs, toMs);
    const dur = fmtDur(toMs - fromMs);
    const resetNote = (hasResetIn || hasResetWk)
      ? ' <span class="hint" style="color:#facc15">includes a window reset — negative delta is real</span>'
      : '';
    selInfo.innerHTML =
      '<div><b>Selection</b>  ·  ' + escapeHtml(String(inSel.length)) + ' turns  ·  ' +
      escapeHtml(span) + '  (' + escapeHtml(dur) + ')</div>' +
      '<div style="margin-top:4px">' +
      '<span style="margin-right:18px">5h: <b>' + fmtSigned(sum5) + '</b>' +
      (n5 < inSel.length ? ' <span class="hint">(' + n5 + '/' + inSel.length + ' had a delta)</span>' : '') +
      '</span>' +
      '<span>week: <b>' + fmtSigned(sumW) + '</b>' +
      (nw < inSel.length ? ' <span class="hint">(' + nw + '/' + inSel.length + ' had a delta)</span>' : '') +
      '</span>' +
      resetNote +
      '<span class="hint">drag again to redo · click outside / Esc to clear</span>' +
      '</div>';
    selInfo.style.display = 'block';
  }

  function clearSelection() {
    activeSelection = null;
    selInfo.style.display = 'none';
  }

  function svgPointFromEvent(e) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(ctm.inverse());
    return { x: sp.x, y: sp.y };
  }
  function clampX(x) { return Math.max(PAD.left, Math.min(PAD.left + PW, x)); }
  function timeFromX(x) {
    const t = (x - PAD.left) / PW;
    return currentScale.fromMs + t * (currentScale.toMs - currentScale.fromMs);
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const sp = svgPointFromEvent(e); if (!sp) return;
    if (sp.x < PAD.left || sp.x > PAD.left + PW) return;
    if (sp.y < PAD.top  || sp.y > PAD.top  + PH) return;
    dragState = { startX: sp.x, rect: null };
    try { svg.setPointerCapture(e.pointerId); } catch {}
    hideTooltip();
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const sp = svgPointFromEvent(e); if (!sp) return;
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

  function render() {
    applyTheme();
    clear();
    daysInput.classList.remove('invalid');
    const range = parseRange(daysInput.value);
    if (range.error) {
      renderRulesError(range.error);
      return;
    }
    const gapHours = Math.max(0, parseFloat(gapInput.value) || 0);
    const gapMs = gapHours * 60 * 60 * 1000;
    const nowMs = Date.now();
    const win = windowFromRange(range.startDay, range.endDay, nowMs);
    let fromMs = win.fromMs, toMs = win.toMs;
    let days = win.daysSpan;

    const visible = data.samples.filter(s => s.tsMs >= fromMs && s.tsMs <= toMs);

    // Focus on data: clamp the window to [first - 1h, last + 1h] keeping inside
    // the original range. Forecast still extends to the right edge of the new
    // toMs (so it can fit in the focused view).
    if (focusInput.checked && visible.length > 0) {
      const HOUR = 3600000;
      const minTs = visible[0].tsMs;
      const maxTs = visible[visible.length - 1].tsMs;
      fromMs = Math.max(fromMs, minTs - HOUR);
      toMs = Math.min(toMs, maxTs + HOUR);
      days = (toMs - fromMs) / 86400000; // float days for tick density
    }

    // Stash for the drag-selection handlers (which run outside render scope).
    currentVisible = visible;
    currentScale = { fromMs, toMs };
    if (activeSelection &&
        (activeSelection.toMs < fromMs || activeSelection.fromMs > toMs)) {
      clearSelection();
    }

    const focusNote = focusInput.checked && visible.length > 0 ? '  ·  focused' : '';
    meta.textContent = rangeLabel(range.startDay, range.endDay, win.fromMs, win.toMs) + '  ·  samples: ' + visible.length + focusNote;

    // Gradient defs: <fade> at 100% used (top), <sat> at 0% used (bottom).
    const defs = el('defs');
    function makeGrad(id, satColor, fadeColor) {
      const grad = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: PAD.top, x2: 0, y2: PAD.top + PH });
      const top = el('stop', { offset: '0%', 'stop-color': fadeColor });
      const bot = el('stop', { offset: '100%', 'stop-color': satColor });
      grad.appendChild(top);
      grad.appendChild(bot);
      defs.appendChild(grad);
    }
    makeGrad('fiveGrad', fiveSatInput.value, fiveFadeInput.value);
    makeGrad('weekGrad', weekSatInput.value, weekFadeInput.value);
    svg.appendChild(defs);

    // Y axis
    const ticks = [0, 25, 50, 75, 100];
    const g = el('g', { class: 'axis' });
    g.appendChild(el('line', { class: 'axis-line', x1: PAD.left, y1: PAD.top, x2: PAD.left, y2: PAD.top + PH }));
    for (const t of ticks) {
      const y = PAD.top + PH - (t / 100) * PH;
      g.appendChild(el('line', { class: 'gridline', x1: PAD.left, y1: y, x2: PAD.left + PW, y2: y }));
      const txt = el('text', { x: PAD.left - 6, y: y + 3, 'text-anchor': 'end' });
      txt.textContent = t + '%';
      g.appendChild(txt);
    }
    svg.appendChild(g);

    // X axis
    const xAxis = el('g', { class: 'axis' });
    xAxis.appendChild(el('line', { class: 'axis-line', x1: PAD.left, y1: PAD.top + PH, x2: PAD.left + PW, y2: PAD.top + PH }));
    const xTicks = pickXTicks(fromMs, toMs);
    for (const tk of xTicks) {
      const x = PAD.left + ((tk.ms - fromMs) / (toMs - fromMs)) * PW;
      xAxis.appendChild(el('line', { class: 'gridline', x1: x, y1: PAD.top, x2: x, y2: PAD.top + PH }));
      const lbl = el('text', { x: x, y: PAD.top + PH + 16, 'text-anchor': 'middle' });
      lbl.textContent = tk.label;
      xAxis.appendChild(lbl);
    }
    svg.appendChild(xAxis);

    if (!visible.length) {
      const lbl = rangeLabel(range.startDay, range.endDay, fromMs, toMs);
      showMessage([
        '<b style="color: var(--muted)">No usage data for ' + escapeHtml(lbl) + '.</b>',
        '<p style="margin-top:10px">The hook log has no entries inside this window.</p>',
      ]);
      return;
    }

    function xOf(ms) { return PAD.left + ((ms - fromMs) / (toMs - fromMs)) * PW; }
    function yOf(p) { return PAD.top + PH - (Math.min(100, Math.max(0, p)) / 100) * PH; }

    function midColor(a, b) {
      const r1 = parseInt(a.slice(1, 3), 16), g1 = parseInt(a.slice(3, 5), 16), b1 = parseInt(a.slice(5, 7), 16);
      const r2 = parseInt(b.slice(1, 3), 16), g2 = parseInt(b.slice(3, 5), 16), b2 = parseInt(b.slice(5, 7), 16);
      const m = (x, y) => Math.round((x + y) / 2).toString(16).padStart(2, '0');
      return '#' + m(r1, r2) + m(g1, g2) + m(b1, b2);
    }
    const fiveMid = midColor(fiveSatInput.value, fiveFadeInput.value);
    const weekMid = midColor(weekSatInput.value, weekFadeInput.value);

    // Day-boundary markers: thin white dashed verticals at every 00:00 inside
    // the window. Skip when the chart shows only one day (no boundaries inside).
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

    // Reset markers: vertical dashed lines where the limit dropped.
    for (let i = 1; i < visible.length; i++) {
      const cur = visible[i], prev = visible[i - 1];
      const x = xOf(cur.tsMs);
      if (cur.five < prev.five) {
        svg.appendChild(el('line', {
          x1: x, y1: PAD.top, x2: x, y2: PAD.top + PH,
          stroke: fiveMid, 'stroke-width': '1', 'stroke-dasharray': '4 4', 'stroke-opacity': '0.65',
        }));
      }
      if (cur.week < prev.week) {
        svg.appendChild(el('line', {
          x1: x, y1: PAD.top, x2: x, y2: PAD.top + PH,
          stroke: weekMid, 'stroke-width': '1', 'stroke-dasharray': '4 4', 'stroke-opacity': '0.65',
        }));
      }
    }

    // Predicted reset markers: ts of next reset = sample.tsMs + parsed countdown.
    // Use the latest non-stale sample so the resetsIn string isn't an old copy
    // carried forward by parser fallback.
    function parseDur(str) {
      if (!str || str === 'now') return null;
      const re = /(\\d+)([dhm])/g;
      let total = 0, matched = false, m;
      while ((m = re.exec(str)) !== null) {
        matched = true;
        const n = parseInt(m[1], 10);
        if (m[2] === 'd') total += n * 86400000;
        else if (m[2] === 'h') total += n * 3600000;
        else total += n * 60000;
      }
      return matched ? total : null;
    }
    let lastValid = null;
    for (let i = data.samples.length - 1; i >= 0; i--) {
      if (!data.samples[i].stale) { lastValid = data.samples[i]; break; }
    }
    if (lastValid) {
      const fiveDur = parseDur(lastValid.fiveResetsIn);
      if (fiveDur != null) {
        const resetMs = lastValid.tsMs + fiveDur;
        if (resetMs > fromMs && resetMs < toMs) {
          const x = xOf(resetMs);
          svg.appendChild(el('line', {
            x1: x, y1: PAD.top, x2: x, y2: PAD.top + PH,
            stroke: fiveMid, 'stroke-width': '1', 'stroke-dasharray': '4 4', 'stroke-opacity': '0.65',
          }));
        }
      }
      const weekDur = parseDur(lastValid.weekResetsIn);
      if (weekDur != null) {
        const resetMs = lastValid.tsMs + weekDur;
        if (resetMs > fromMs && resetMs < toMs) {
          const x = xOf(resetMs);
          svg.appendChild(el('line', {
            x1: x, y1: PAD.top, x2: x, y2: PAD.top + PH,
            stroke: weekMid, 'stroke-width': '1', 'stroke-dasharray': '4 4', 'stroke-opacity': '0.65',
          }));
        }
      }
    }

    const breakOnReset = breakOnResetInput.checked;
    function lineFor(getY, color) {
      const segs = [];
      for (let i = 0; i < visible.length; i++) {
        const p = visible[i];
        const x = xOf(p.tsMs).toFixed(1);
        const y = yOf(getY(p)).toFixed(1);
        const prev = visible[i - 1];
        const tooFar = prev && gapMs > 0 && (p.tsMs - prev.tsMs) > gapMs;
        const dropped = prev && breakOnReset && getY(p) < getY(prev);
        const breakHere = i === 0 || tooFar || dropped;
        segs.push((breakHere ? 'M' : 'L') + x + ' ' + y);
      }
      svg.appendChild(el('path', { d: segs.join(' '), fill: 'none', stroke: color, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
    lineFor(p => p.week, 'url(#weekGrad)');
    lineFor(p => p.five, 'url(#fiveGrad)');

    // Two circles per turn (week + 5h) inside one <g class="point-group">,
    // so hover on the hit-area can highlight both at once via a single
    // CSS class. pointer-events:none on each circle delegates hover entirely
    // to the hit-area added below.
    const pointGroups = new Array(visible.length);
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const x = xOf(p.tsMs);
      const g = el('g', { class: 'point-group' });
      g.appendChild(el('circle', {
        cx: x, cy: yOf(p.week), r: 3, fill: 'url(#weekGrad)',
        stroke: 'var(--bg)', 'stroke-width': '1', 'pointer-events': 'none',
      }));
      g.appendChild(el('circle', {
        cx: x, cy: yOf(p.five), r: 3, fill: 'url(#fiveGrad)',
        stroke: 'var(--bg)', 'stroke-width': '1', 'pointer-events': 'none',
      }));
      svg.appendChild(g);
      pointGroups[i] = g;
    }

    // Per-turn hit-area, capped at MAX_HALF_PX each side so sparse data
    // doesn't make the hover zone span hours of empty time. One tooltip per
    // turn with both 5h and week info.
    const MAX_HALF_PX = 20;
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const cx = xOf(p.tsMs);
      const prevX = i > 0 ? xOf(visible[i - 1].tsMs) : null;
      const nextX = i < visible.length - 1 ? xOf(visible[i + 1].tsMs) : null;
      const halfL = prevX != null ? Math.min(MAX_HALF_PX, (cx - prevX) / 2) : MAX_HALF_PX;
      const halfR = nextX != null ? Math.min(MAX_HALF_PX, (nextX - cx) / 2) : MAX_HALF_PX;
      const tFmt = fmtDateTime(p.tsMs, days <= 1 ? 'time' : 'both');
      const tip = '<b>' + tFmt + '</b><br>5h: <b>' + p.five.toFixed(1) + '%</b>' +
        (p.fiveDelta != null ? ' (' + (p.fiveDelta > 0 ? '+' : '') + p.fiveDelta.toFixed(1) + ')' : '') +
        '<br>week: <b>' + p.week.toFixed(1) + '%</b>' +
        (p.weekDelta != null ? ' (' + (p.weekDelta > 0 ? '+' : '') + p.weekDelta.toFixed(1) + ')' : '');
      const hit = el('rect', {
        x: cx - halfL, y: PAD.top, width: halfL + halfR, height: PH,
        fill: 'transparent', 'pointer-events': 'all',
      });
      const group = pointGroups[i];
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

    if (forecastInput.checked && visible.length >= 2) {
      function drawForecast(getY, color) {
        const N = Math.min(5, visible.length);
        const last = visible[visible.length - 1];
        const first = visible[visible.length - N];
        const yLast = getY(last);
        const yFirst = getY(first);
        const dt = last.tsMs - first.tsMs;
        const dy = yLast - yFirst;
        if (dt <= 0 || dy <= 0 || yLast >= 100) return;
        const slope = dy / dt;
        const t100 = last.tsMs + (100 - yLast) / slope;
        const xEndMs = Math.min(t100, toMs);
        if (xEndMs <= last.tsMs) return;
        const yEnd = Math.min(100, yLast + slope * (xEndMs - last.tsMs));
        svg.appendChild(el('line', {
          x1: xOf(last.tsMs), y1: yOf(yLast),
          x2: xOf(xEndMs), y2: yOf(yEnd),
          stroke: color, 'stroke-width': '2',
          'stroke-dasharray': '6 4', 'stroke-opacity': '0.75',
          'stroke-linecap': 'round',
        }));
      }
      drawForecast(p => p.week, 'url(#weekGrad)');
      drawForecast(p => p.five, 'url(#fiveGrad)');
    }

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

  // Initial sync: send the (loaded or default) settings to extension so the
  // sidebar mini chart reflects them immediately.
  persist();

  function onChange() { clearSelection(); persist(); render(); }
  [daysInput, gapInput, fiveSatInput, fiveFadeInput, weekSatInput, weekFadeInput, breakOnResetInput, forecastInput, focusInput].forEach(inp => {
    inp.addEventListener('input', onChange);
    inp.addEventListener('change', onChange);
  });
  document.getElementById('resetColors').addEventListener('click', () => {
    [fiveSatInput, fiveFadeInput, weekSatInput, weekFadeInput].forEach(inp => {
      inp.value = inp.getAttribute('value');
    });
    onChange();
  });
  document.addEventListener('mousemove', (e) => {
    if (tooltip.style.opacity === '1') {
      positionTooltip(e.pageX, e.pageY);
    }
  });

  // Live data updates from the extension (sent on every log change).
  // The webview keeps its DOM/JS context alive while hidden thanks to
  // retainContextWhenHidden, so DOM mutations here are visible the
  // moment the user switches back to this tab — no html reassignment
  // and no re-mount delay.
  window.addEventListener('message', (e) => {
    const msg = e && e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'data' && msg.data && Array.isArray(msg.data.samples)) {
      data = msg.data;
      render();
    }
  });

  render();

  // Ask the extension for fresh data once we're ready to receive it.
  // (Initial render uses the data baked into the html so the first
  // paint is never blank.)
  if (vsApi) vsApi.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
