import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const DEFAULT_LOG_PATH = path.join(os.homedir(), '.claude', 'usage-log.txt');

export interface UsageWindow {
  percent: number;
  resetsIn: string | null;
  delta: number | null;
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
  stale: boolean;
}

const FULL_LINE_RE = /\[(?<ts>[^\]]+)\][\s\S]*?5h\s+(?<h5>[\d.]+)%(?:\s*\((?<h5d>[+-][\d.]+)%\))?(?:\s*↻(?<h5r>\S+))?[\s\S]*?week\s+(?<wk>[\d.]+)%(?:\s*\((?<wkd>[+-][\d.]+)%\))?(?:\s*↻(?<wkr>\S+))?/;
const TS_ONLY_RE = /^\s*\[(?<ts>[^\]]+)\]/;

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
      stale: false,
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
      stale: true,
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
  // Compute missing deltas from neighbours.
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i].fiveDelta == null) filtered[i].fiveDelta = round2(filtered[i].five - filtered[i - 1].five);
    if (filtered[i].weekDelta == null) filtered[i].weekDelta = round2(filtered[i].week - filtered[i - 1].week);
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
