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
  // ISO timestamp of the next reset (`resets_at` from the API). Present only on
  // log entries written by hook >= 0.46. Used to compute past reset moments
  // exactly: when prev.fiveResetsAtIso != cur.fiveResetsAtIso, the reset
  // happened at prev.fiveResetsAtIso. Older entries have null here and are
  // treated as "no precise reset info available".
  fiveResetsAtIso: string | null;
  weekResetsAtIso: string | null;
  fiveWindowReset: boolean;
  weekWindowReset: boolean;
  stale: boolean;
  fiveBugged: boolean;
  weekBugged: boolean;
  tokIn: number | null;
  tokOut: number | null;
  tokCacheCreate: number | null;
  tokCacheRead: number | null;
  model: string | null;
}

// The countdown group `↻Nh Nm` may optionally be followed by `@<iso>` (added in
// hook 0.46). Capture both. The @-iso form is greedy on non-whitespace, so the
// countdown remains alphanumeric like `4h53m` / `6d20h` without consuming the
// `@`.
const FULL_LINE_RE = /\[(?<ts>[^\]]+)\][\s\S]*?5h\s+(?<h5>[\d.]+)%(?:\s*\((?<h5d>[+-][\d.]+)%\))?(?:\s*↻(?<h5r>[^\s@]+)(?:@(?<h5i>\S+))?)?[\s\S]*?week\s+(?<wk>[\d.]+)%(?:\s*\((?<wkd>[+-][\d.]+)%\))?(?:\s*↻(?<wkr>[^\s@]+)(?:@(?<wki>\S+))?)?/;
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
      fiveResetsAtIso: g.h5i ?? null,
      weekResetsAtIso: g.wki ?? null,
      fiveWindowReset: false,
      weekWindowReset: false,
      stale: false,
      fiveBugged: false,
      weekBugged: false,
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
      fiveResetsAtIso: null,
      weekResetsAtIso: null,
      fiveWindowReset: false,
      weekWindowReset: false,
      stale: true,
      fiveBugged: false,
      weekBugged: false,
      ...extractTokens(line),
    };
  }
  return null;
}

export interface ReadOptions {
  ignoreBuggedApiData?: boolean;
}

// Two deterministic rules for catching the API's bugged `100%` readings.
// Observed pattern: the rate-limit endpoint occasionally pegs the response to
// exactly 100% even when the real value is far lower. Other values are trusted.
//   - PREV_LOW_THRESHOLD: if cur reads exactly 100% AND prev read at most this,
//     within the same window, it's a bugged spike (a 30-percentage-point single-
//     turn jump is implausible). Carry forward prev value.
//   - At reset (cur=100% AND we crossed the window boundary): force cur to 0%.
//     A fresh window structurally starts at 0; the API's 100% is garbage from
//     the previous window leaking through.
const PREV_LOW_THRESHOLD = 70;

export function readAll(filePath: string, opts?: ReadOptions): ParsedSample[] {
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
      e.fiveResetsAtIso = lastValid.fiveResetsAtIso;
      e.weekResetsAtIso = lastValid.weekResetsAtIso;
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
  // When a reset is detected we set the windowReset flag AND assign delta =
  // cur.value: the new window started at 0% at reset time, hooks fire once per
  // turn, so the first sample after reset reflects exactly one turn's spend in
  // the new window. The UI flags it as "new window" so users see both the spend
  // number and the reset indicator instead of a hidden "across windows" delta.
  const RESET_EPSILON_MS = 60_000;
  const ignoreBuggedApiData = opts?.ignoreBuggedApiData ?? false;
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const cur = filtered[i];
    const fivePrevMs = parseDur(prev.fiveResetsIn);
    const fiveCurMs = parseDur(cur.fiveResetsIn);
    const fiveReset = fivePrevMs != null && fiveCurMs != null && fiveCurMs > fivePrevMs + RESET_EPSILON_MS;
    const weekPrevMs = parseDur(prev.weekResetsIn);
    const weekCurMs = parseDur(cur.weekResetsIn);
    const weekReset = weekPrevMs != null && weekCurMs != null && weekCurMs > weekPrevMs + RESET_EPSILON_MS;

    // Bugged-API filter — two deterministic rules, both triggered by cur=100%
    // exactly (the only saturation pattern actually observed from the API):
    //   Rule A: cur=100% AT a window boundary (countdown went up) → force
    //           cur=0%. The new window structurally starts at 0; whatever the
    //           API claims is garbage leaking from the previous window.
    //   Rule B: cur=100% MID-WINDOW with prev <= PREV_LOW_THRESHOLD → carry
    //           forward prev. A 30+-point single-turn jump from a low value is
    //           implausible.
    // Other values trusted. The toggle gates these rules; off restores raw
    // pass-through behaviour.
    if (ignoreBuggedApiData && cur.five === 100 && fiveReset) {
      cur.five = 0;
      cur.fiveDelta = 0;
      cur.fiveWindowReset = true;
      cur.fiveBugged = true;
    } else if (ignoreBuggedApiData && cur.five === 100 && !fiveReset && prev.five <= PREV_LOW_THRESHOLD) {
      cur.five = prev.five;
      cur.fiveResetsIn = prev.fiveResetsIn;
      cur.fiveDelta = 0;
      cur.fiveWindowReset = false;
      cur.fiveBugged = true;
    } else if (fiveReset) {
      cur.fiveWindowReset = true;
      cur.fiveDelta = round2(cur.five);
    } else if (cur.fiveDelta == null) {
      cur.fiveDelta = round2(cur.five - prev.five);
    }

    if (ignoreBuggedApiData && cur.week === 100 && weekReset) {
      cur.week = 0;
      cur.weekDelta = 0;
      cur.weekWindowReset = true;
      cur.weekBugged = true;
    } else if (ignoreBuggedApiData && cur.week === 100 && !weekReset && prev.week <= PREV_LOW_THRESHOLD) {
      cur.week = prev.week;
      cur.weekResetsIn = prev.weekResetsIn;
      cur.weekDelta = 0;
      cur.weekWindowReset = false;
      cur.weekBugged = true;
    } else if (weekReset) {
      cur.weekWindowReset = true;
      cur.weekDelta = round2(cur.week);
    } else if (cur.weekDelta == null) {
      cur.weekDelta = round2(cur.week - prev.week);
    }
  }
  return filtered;
}

export function readLatest(filePath: string, opts?: ReadOptions): ParsedSample | null {
  const all = readAll(filePath, opts);
  return all.length > 0 ? all[all.length - 1] : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
