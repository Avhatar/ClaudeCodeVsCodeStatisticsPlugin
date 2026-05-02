import { ParsedSample } from './logSource';
import { PricingTable } from './pricing';

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
  tokIn: number | null;
  tokOut: number | null;
  tokCacheCreate: number | null;
  tokCacheRead: number | null;
  model: string | null;
}

export interface ChartData {
  samples: ChartTimePoint[];
  generatedAt: string;
  generatedAtMs: number;
  pricing: PricingTable | null;
}

export function prepareChartData(entries: ParsedSample[], pricing: PricingTable | null = null): ChartData {
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
      tokIn: e.tokIn,
      tokOut: e.tokOut,
      tokCacheCreate: e.tokCacheCreate,
      tokCacheRead: e.tokCacheRead,
      model: e.model,
    });
  }
  samples.sort((a, b) => a.tsMs - b.tsMs);
  const now = Date.now();
  return {
    samples,
    generatedAt: new Date(now).toISOString(),
    generatedAtMs: now,
    pricing,
  };
}
