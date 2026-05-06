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

export interface ChartData {
  samples: ChartTimePoint[];
  generatedAt: string;
  generatedAtMs: number;
  pricing: PricingTable | null;
  vscodeSkin: boolean;
}

export function prepareChartData(entries: ParsedSample[], pricing: PricingTable | null = null, vscodeSkin: boolean = false): ChartData {
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
      fiveResetsAtIso: e.fiveResetsAtIso,
      weekResetsAtIso: e.weekResetsAtIso,
      fiveWindowReset: e.fiveWindowReset,
      weekWindowReset: e.weekWindowReset,
      stale: e.stale,
      fiveBugged: e.fiveBugged,
      weekBugged: e.weekBugged,
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
    vscodeSkin,
  };
}
