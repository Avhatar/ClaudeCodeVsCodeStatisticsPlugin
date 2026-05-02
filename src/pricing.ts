import * as fs from 'fs';
import * as path from 'path';

export interface ModelPrices {
  input: number;
  output: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_read: number;
}

export interface PricingTable {
  models: Record<string, ModelPrices>;
  fallback: string;
  _updated?: string;
  _source?: string;
}

export function loadPricing(extensionPath: string): PricingTable | null {
  const p = path.join(extensionPath, 'media', 'pricing.json');
  if (!fs.existsSync(p)) return null;
  let raw: string;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return null; }
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const obj = j as Record<string, unknown>;
  if (!obj.models || typeof obj.models !== 'object') return null;
  if (typeof obj.fallback !== 'string') return null;
  return obj as unknown as PricingTable;
}
