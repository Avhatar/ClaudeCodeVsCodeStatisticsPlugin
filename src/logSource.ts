import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDur } from './chartLogic';

export const DEFAULT_LOG_PATH = path.join(os.homedir(), '.claude', 'usage-log.txt');

export interface UsageWindow {
  percent: number;
  resetsIn: string | null;
  delta: number | null;
  windowReset: boolean;
}

export interface UsageStats {
  fiveHour: UsageWindow;
  week: UsageWindow;
  fetchedAt: string;
  stale: boolean;
}

export interface ParsedSample {
  ts: string;
  five: number;
  week: number;
  fiveDelta: number | null;
  weekDelta: number | null;
  fiveResetsIn: string | null;
  weekResetsIn: string | null;
  fiveWindowReset: boolean;
  weekWindowReset: boolean;
  stale: boolean;
  tokIn: number | null;
  tokOut: number | null;
  tokCacheCreate: number | null;
  tokCacheRead: number | null;
  model: string | null;
}

const FULL_LINE_RE = /\[(?<ts>[^\]]+)\][\s\S]*?5h\s+(?<h5>[\d.]+)%(?:\s*\((?<h5d>[+-][\d.]+)%\))?(?:\s*↻(?<h5r>\S+))?[\s\S]*?week\s+(?<wk>[\d.]+)%(?:\s*\((?<wkd>[+-][\d.]+)%\))?(?:\s*↻(?<wkr>\S+))?/;
const TS_ONLY_RE = /^\s*\[(?<ts>[^\]]+)\]/;
const TOKENS_RE = /turn\s+in:(\d+(?:\.\d+)?[KM]?)\s+out:(\d+(?:\.\d+)?[KM]?)\s+c\+(\d+(?:\.\d+)?[KM]?)\s+c-(\d+(?:\.\d+)?[KM]?)/;
const MODEL_RE = /\bmodel=([\w.\-]+)/;

function parseShort(s: string): number {
  const last = s.charAt(s.length - 1);
  if (last === 'K') return parseFloat(s) * 1000;
  if (last === 'M') return parseFloat(s) * 1_000_000;
  return parseFloat(s);
}

function extractTokens(line: string) {
  const m = TOKENS_RE.exec(line);
  const mm = MODEL_RE.exec(line);
  const model = mm ? mm[1] : null;
  if (!m) return { tokIn: null, tokOut: null, tokCacheCreate: null, tokCacheRead: null, model };
  return {
    tokIn: parseShort(m[1]),
    tokOut: parseShort(m[2]),
    tokCacheCreate: parseShort(m[3]),
    tokCacheRead: parseShort(m[4]),
    model,
  };
}

interface RawSample extends ParsedSample {}

export function parseLine(line: string): RawSample | null {
  const full = FULL_LINE_RE.exec(line);
  if (full && full.groups) {
    const g = full.groups;
    const tsDate = new Date(g.ts);
    if (isNaN(tsDate.getTime())) return null;
    return {
      ts: tsDate.toISOString(),
      five: parseFloat(g.h5),
      week: parseFloat(g.wk),
      fiveDelta: g.h5d ? parseFloat(g.h5d) : null,
      weekDelta: g.wkd ? parseFloat(g.wkd) : null,
      fiveResetsIn: g.h5r ?? null,
      weekResetsIn: g.wkr ?? null,
      fiveWindowReset: false,
      weekWindowReset: false,
      stale: false,
      ...extractTokens(line),
    };
  }
  // Fallback: line has a timestamp but no parseable %. We still register it
  // (e.g. "limits: n/a (HTTP 429)") so the timeline doesn't lose this turn.
  const tsOnly = TS_ONLY_RE.exec(line);
  if (tsOnly && tsOnly.groups) {
    const tsDate = new Date(tsOnly.groups.ts);
    if (isNaN(tsDate.getTime())) return null;
    return {
      ts: tsDate.toISOString(),
      five: NaN,
      week: NaN,
      fiveDelta: null,
      weekDelta: null,
      fiveResetsIn: null,
      weekResetsIn: null,
      fiveWindowReset: false,
      weekWindowReset: false,
      stale: true,
      ...extractTokens(line),
    };
  }
  return null;
}

export function readAll(filePath: string): ParsedSample[] {
  if (!fs.existsSync(filePath)) return [];
  let raw: string;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const out: RawSample[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const e = parseLine(line);
    if (e) out.push(e);
  }
  // Carry forward last valid values into stale samples so the chart/summary
  // doesn't see NaNs.
  let lastValid: RawSample | null = null;
  for (const e of out) {
    if (!e.stale) {
      lastValid = e;
    } else if (lastValid) {
      e.five = lastValid.five;
      e.week = lastValid.week;
      e.fiveResetsIn = lastValid.fiveResetsIn;
      e.weekResetsIn = lastValid.weekResetsIn;
    }
  }
  // Drop stale samples that came before any valid one (no fallback available).
  const filtered = out.filter(e => !isNaN(e.five) && !isNaN(e.week));
  // Compute missing deltas from neighbours, and detect window resets.
  // The hook writes deltas as a blind `curr% - prev%`, which is meaningless
  // when the underlying 5h/week window reset between fetches: the prev sample
  // measured one window, the curr sample measures a fresh one. We detect such
  // a reset via the `↻` countdown — it can only decrease as time passes, so a
  // significant increase between consecutive samples means the window flipped.
  // When detected, null out the delta and mark the window-reset flag so the UI
  // can show "window reset" instead of a misleading "+56%".
  const RESET_EPSILON_MS = 60_000;
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const cur = filtered[i];
    const fivePrevMs = parseDur(prev.fiveResetsIn);
    const fiveCurMs = parseDur(cur.fiveResetsIn);
    if (fivePrevMs != null && fiveCurMs != null && fiveCurMs > fivePrevMs + RESET_EPSILON_MS) {
      cur.fiveWindowReset = true;
      cur.fiveDelta = null;
    } else if (cur.fiveDelta == null) {
      cur.fiveDelta = round2(cur.five - prev.five);
    }
    const weekPrevMs = parseDur(prev.weekResetsIn);
    const weekCurMs = parseDur(cur.weekResetsIn);
    if (weekPrevMs != null && weekCurMs != null && weekCurMs > weekPrevMs + RESET_EPSILON_MS) {
      cur.weekWindowReset = true;
      cur.weekDelta = null;
    } else if (cur.weekDelta == null) {
      cur.weekDelta = round2(cur.week - prev.week);
    }
  }
  return filtered;
}

export function readLatest(filePath: string): ParsedSample | null {
  const all = readAll(filePath);
  return all.length > 0 ? all[all.length - 1] : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
