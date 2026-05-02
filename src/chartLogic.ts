export interface ChartSettings {
  days: string;
  gap: number;
  breakOnReset: boolean;
  forecast: boolean;
  focus: boolean;
  fiveSat: string;
  fiveFade: string;
  weekSat: string;
  weekFade: string;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  days: '1',
  gap: 8,
  breakOnReset: true,
  forecast: false,
  focus: false,
  fiveSat: '#ff0000',
  fiveFade: '#ffc2c2',
  weekSat: '#2499ff',
  weekFade: '#a8cfff',
};

export interface TokensChartSettings {
  days: string;
  gap: number;
  yMode: 'tokens' | 'logTokens' | 'usd';
  focus: boolean;
}

export const DEFAULT_TOKENS_CHART_SETTINGS: TokensChartSettings = {
  days: '1',
  gap: 8,
  yMode: 'usd',
  focus: true,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type RangeResult =
  | { error: string }
  | { startDay: number; endDay: number };

export function parseRange(input: string): RangeResult {
  const raw = String(input == null ? '' : input);
  const s = raw
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/[^\d()\-]/g, '');
  if (!s) return { error: 'empty' };

  let m = /^(\d+)-(\d+)$/.exec(s);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a < 1 || b < 1) return { error: 'days must be >= 1' };
    return { startDay: Math.max(a, b), endDay: Math.min(a, b) };
  }
  m = /^\((\d+)\)$/.exec(s);
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
  return { error: 'cannot parse' };
}

export function windowFromRange(startDay: number, endDay: number, nowMs: number) {
  const sod = new Date(nowMs);
  sod.setHours(0, 0, 0, 0);
  const fromMs = sod.getTime() - (startDay - 1) * DAY_MS;
  const toMs = sod.getTime() - (endDay - 1) * DAY_MS + DAY_MS;
  return { fromMs, toMs, daysSpan: startDay - endDay + 1 };
}

export function parseDur(str: string | null | undefined): number | null {
  if (!str || str === 'now') return null;
  const re = /(\d+)([dhm])/g;
  let total = 0, matched = false, m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    matched = true;
    const n = parseInt(m[1], 10);
    if (m[2] === 'd') total += n * 86400000;
    else if (m[2] === 'h') total += n * 3600000;
    else total += n * 60000;
  }
  return matched ? total : null;
}

export function midColor(a: string, b: string): string {
  const r1 = parseInt(a.slice(1, 3), 16), g1 = parseInt(a.slice(3, 5), 16), b1 = parseInt(a.slice(5, 7), 16);
  const r2 = parseInt(b.slice(1, 3), 16), g2 = parseInt(b.slice(3, 5), 16), b2 = parseInt(b.slice(5, 7), 16);
  const m = (x: number, y: number) => Math.round((x + y) / 2).toString(16).padStart(2, '0');
  return '#' + m(r1, r2) + m(g1, g2) + m(b1, b2);
}
