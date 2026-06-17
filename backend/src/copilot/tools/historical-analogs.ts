// Engine B — historical-analog retrieval ("proof from history").
//
// Given the most recent price window (the shape leading into the candle in
// question), find the most similar past windows in this asset's own history and
// report what happened NEXT. This is kNN time-series analog matching:
//   1. encode each window as a z-normalized return vector (shape, not price level)
//   2. cosine-rank all earlier windows against the query window
//   3. for the top matches, measure forward returns (+1/+3/+7 bars)
//   4. aggregate into an empirical outcome distribution.
//
// Look-ahead safety: the query window is the series tail, and candidate windows
// (plus their forward horizon) must sit entirely BEFORE the query window — so no
// future information leaks into the match or its measured outcome.
import type { TACandle } from './technical-analysis.js';

export interface AnalogMatch {
  date: number;        // end date of the matched window
  similarity: number;  // cosine similarity to the query window (0..1)
  ret1d: number;       // forward returns after the matched window (%)
  ret3d: number;
  ret7d: number;
}

export interface AnalogResult {
  windowSize: number;
  sampleSize: number;          // how many matches the stats are based on
  matches: AnalogMatch[];      // top matches (for "similar to <date>")
  bullishPct3d: number;        // % of matches that rose over 3 bars
  avgRet3d: number;
  avgRet7d: number;
  summary: string;
}

function znorm(v: number[]): number[] {
  const n = v.length;
  if (n === 0) return v;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return v.map((x) => (x - mean) / sd);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}

// Return vector of a window [start, start+w) encoded as z-normalized daily returns.
function windowVec(closes: number[], start: number, w: number): number[] {
  const rets: number[] = [];
  for (let i = start + 1; i < start + w; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  return znorm(rets);
}

// Core matcher: query window is history[qStart .. qStart+w-1]; search every other
// window of the same length whose forward horizon exists and that doesn't overlap
// the query (overlap would be trivially self-similar). Look-ahead safe because each
// candidate's forward return is measured only from candles after that candidate.
function matchAnalogs(
  candles: TACandle[],
  qStart: number,
  w: number,
  opts: { topK?: number; minSimilarity?: number } = {}
): AnalogResult | null {
  const topK = opts.topK ?? 8;
  // kNN: take the nearest neighbours regardless of an absolute threshold (longer
  // windows have lower max cosine). `minSimilarity` only guards against pure noise.
  const minSim = opts.minSimilarity ?? 0.2;
  const H = 7;
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  if (w < 7 || qStart < 0 || qStart + w > n) return null;

  const query = windowVec(closes, qStart, w);
  const qEnd = qStart + w - 1;
  const cands: AnalogMatch[] = [];
  for (let s = 0; s + w - 1 + H < n; s++) {
    const end = s + w - 1;
    if (!(end < qStart || s > qEnd)) continue; // skip overlap with query window
    const sim = cosine(query, windowVec(closes, s, w));
    const base = closes[end];
    cands.push({
      date: candles[end].time,
      similarity: sim,
      ret1d: ((closes[end + 1] - base) / base) * 100,
      ret3d: ((closes[end + 3] - base) / base) * 100,
      ret7d: ((closes[end + 7] - base) / base) * 100,
    });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.similarity - a.similarity);
  const top = cands.slice(0, topK).filter((m) => m.similarity >= minSim);
  if (top.length === 0) return null;
  return finishResult(top, w);
}

function finishResult(top: AnalogMatch[], w: number): AnalogResult {
  const sample = top.length;
  const bullish3 = top.filter((m) => m.ret3d > 0).length;
  const avg = (sel: (m: AnalogMatch) => number) => top.reduce((s, m) => s + sel(m), 0) / sample;
  const avgRet3d = avg((m) => m.ret3d);
  const avgRet7d = avg((m) => m.ret7d);
  const bullishPct3d = (bullish3 / sample) * 100;

  const summary =
    `This ${w}-day setup resembles ${sample} prior case${sample > 1 ? 's' : ''} in history ` +
    `(closest: ${new Date(top[0].date).toISOString().slice(0, 10)}, ${(top[0].similarity * 100).toFixed(0)}% similar). ` +
    `Afterwards price rose ${bullish3}/${sample} times over the next 3 days ` +
    `(avg ${avgRet3d >= 0 ? '+' : ''}${avgRet3d.toFixed(1)}%), and averaged ${avgRet7d >= 0 ? '+' : ''}${avgRet7d.toFixed(1)}% over 7 days.`;

  return { windowSize: w, sampleSize: sample, matches: top, bullishPct3d, avgRet3d, avgRet7d, summary };
}

/** Default flow: query = the most recent `window` candles (default 30 ≈ 1 month). */
export function findAnalogs(
  candles: TACandle[],
  opts: { window?: number; topK?: number; minSimilarity?: number } = {}
): AnalogResult | null {
  const w = opts.window ?? 30;
  if (candles.length < w * 2 + 12) return null;
  return matchAnalogs(candles, candles.length - w, w, opts);
}

/**
 * Range-select flow: analyse the user-marked span as the pattern. The query window
 * is the candles within [fromMs, toMs]; we search the rest of history for analogs
 * of that exact shape (any length the user marked).
 */
export function findAnalogsForWindow(
  candles: TACandle[],
  fromMs: number,
  toMs: number,
  opts: { topK?: number; minSimilarity?: number } = {}
): AnalogResult | null {
  let qStart = candles.findIndex((c) => c.time >= fromMs);
  let qEnd = -1;
  for (let i = 0; i < candles.length; i++) if (candles[i].time <= toMs) qEnd = i;
  if (qStart < 0 || qEnd < 0 || qEnd < qStart) return null;
  const w = qEnd - qStart + 1;
  if (w < 7) return null;
  return matchAnalogs(candles, qStart, w, opts);
}

/** Compact block for the LLM prompt. */
export function summarizeAnalogs(a: AnalogResult): string {
  const tops = a.matches
    .slice(0, 4)
    .map((m) => `${new Date(m.date).toISOString().slice(0, 10)} (${(m.similarity * 100).toFixed(0)}% sim → 3d ${m.ret3d >= 0 ? '+' : ''}${m.ret3d.toFixed(1)}%)`)
    .join('; ');
  return [
    `HISTORICAL ANALOGS (computed via kNN on price-shape, look-ahead safe) — empirical, not a prediction:`,
    `• ${a.summary}`,
    `• Closest analogs: ${tops}`,
  ].join('\n');
}
