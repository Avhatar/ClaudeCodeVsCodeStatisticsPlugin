import { ChartData } from './chart';

export function renderTokensHtml(nonce: string, data: ChartData): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  /* Locked dark palette — see DEV-NOTES "Theme-independent visuals". */
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
  .bar-rect:hover { stroke: rgba(255,255,255,0.6); stroke-width: 0.5; }
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

  const vsApi = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
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
    if (maxV <= 0) return [{ v: 0, y: 1 }];
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

  function showTooltip(evt, html) {
    tooltip.innerHTML = html;
    tooltip.style.left = (evt.pageX + 12) + 'px';
    tooltip.style.top  = (evt.pageY + 12) + 'px';
    tooltip.style.opacity = '1';
  }
  function hideTooltip() { tooltip.style.opacity = '0'; }

  function render() {
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
          stroke: '#ffffff', 'stroke-width': '1', 'stroke-dasharray': '2 4', 'stroke-opacity': '0.3',
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
    const yBase = PAD.top + PH;
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
      const tip =
        '<div class="row"><b>' + fmtTime(p.tsMs, 'both') + '</b></div>' +
        modelLine +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.out + '"></span>output</span><b>' + fmtTok(p.tokOut) + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.out) + '</span>' : '') + '</b></div>' +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.in  + '"></span>input</span><b>'  + fmtTok(p.tokIn)  + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.in_) + '</span>' : '') + '</b></div>' +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.cc  + '"></span>cache+</span><b>'  + fmtTok(p.tokCacheCreate) + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.cc) + '</span>' : '') + '</b></div>' +
        '<div class="row"><span><span class="sw" style="background:' + COLORS.cr  + '"></span>cache-</span><b>'  + fmtTok(p.tokCacheRead) + (cost ? ' <span style="color:var(--muted)">' + fmtUsd(cost.cr) + '</span>' : '') + '</b></div>' +
        '<div class="row" style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px"><span>tokens</span><b>' + fmtTok(tokTotal) + '</b></div>' +
        (cost ? '<div class="row"><span>cost</span><b>' + fmtUsd(cost.total) + '</b></div>' : '');

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
          });
          r.addEventListener('mouseenter', e => showTooltip(e, tip));
          r.addEventListener('mouseleave', hideTooltip);
          svg.appendChild(r);
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
          });
          r.addEventListener('mouseenter', e => showTooltip(e, tip));
          r.addEventListener('mouseleave', hideTooltip);
          svg.appendChild(r);
          cum += v;
        }
      }
    }
  }

  // Initial sync: push current (defaulted-or-saved) settings to the extension
  // so the sidebar mini tokens chart reflects them as soon as the panel opens.
  persist();

  function onChange() { persist(); render(); }
  [daysInput, gapInput, yModeInput, focusInput].forEach(inp => {
    inp.addEventListener('input', onChange);
    inp.addEventListener('change', onChange);
  });
  document.addEventListener('mousemove', (e) => {
    if (tooltip.style.opacity === '1') {
      tooltip.style.left = (e.pageX + 12) + 'px';
      tooltip.style.top  = (e.pageY + 12) + 'px';
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
