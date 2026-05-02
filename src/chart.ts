import { ParsedSample } from './logSource';

export interface ChartTimePoint {
  ts: string;
  tsMs: number;
  five: number;
  week: number;
  fiveDelta: number | null;
  weekDelta: number | null;
  fiveResetsIn: string | null;
  weekResetsIn: string | null;
  stale: boolean;
}

export interface ChartData {
  samples: ChartTimePoint[];
  generatedAt: string;
  generatedAtMs: number;
}

export function prepareChartData(entries: ParsedSample[]): ChartData {
  const samples: ChartTimePoint[] = [];
  for (const e of entries) {
    const t = new Date(e.ts).getTime();
    if (!isFinite(t)) continue;
    samples.push({
      ts: e.ts,
      tsMs: t,
      five: e.five,
      week: e.week,
      fiveDelta: e.fiveDelta,
      weekDelta: e.weekDelta,
      fiveResetsIn: e.fiveResetsIn,
      weekResetsIn: e.weekResetsIn,
      stale: e.stale,
    });
  }
  samples.sort((a, b) => a.tsMs - b.tsMs);
  const now = Date.now();
  return {
    samples,
    generatedAt: new Date(now).toISOString(),
    generatedAtMs: now,
  };
}
