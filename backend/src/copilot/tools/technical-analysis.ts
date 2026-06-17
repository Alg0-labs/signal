// Deterministic technical-analysis engine.
//
// Computes the facts a chart analyst reads — trend (higher highs / lower lows),
// support/resistance levels, moving-average stack, RSI/MACD momentum, volume
// confirmation, and BTC correlation — from raw candles. The LLM never *infers*
// these (it would hallucinate); it only narrates the structured output here.
import { calculateRSI, calculateMACD } from './indicators.js';

export interface TACandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SRLevel {
  price: number;
  kind: 'support' | 'resistance';
  touches: number;
  distancePct: number; // signed distance from current price
}

export interface TrendResult {
  direction: 'uptrend' | 'downtrend' | 'range';
  strength: 'strong' | 'moderate' | 'weak';
  detail: string;
}

export interface MAResult {
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  stack: 'bullish' | 'bearish' | 'mixed';
  pricePosition: string;
  cross: string | null;
}

export interface VolumeResult {
  latest: number;
  avg20: number;
  ratio: number;
  confirmation: string;
}

export interface CorrelationResult {
  withBTC: number | null;
  beta: number | null;
  note: string;
}

export interface MomentumResult {
  rsi: number | null;
  rsiState: 'overbought' | 'oversold' | 'neutral';
  macdHistogram: number | null;
  macdState: 'bullish' | 'bearish' | 'flat';
}

export interface TechnicalAnalysis {
  asOf: number;
  price: number;
  trend: TrendResult;
  levels: SRLevel[];
  movingAverages: MAResult;
  volume: VolumeResult;
  momentum: MomentumResult;
  correlation: CorrelationResult;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function sma(vals: number[], period: number): number | null {
  if (vals.length < period) return null;
  const s = vals.slice(-period);
  return s.reduce((a, b) => a + b, 0) / period;
}

function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  return r;
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

function beta(asset: number[], btc: number[]): number | null {
  const n = Math.min(asset.length, btc.length);
  if (n < 5) return null;
  const x = btc.slice(-n), y = asset.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varx = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    varx += (x[i] - mx) ** 2;
  }
  return varx === 0 ? null : cov / varx;
}

// Fractal swing points: a high/low that is the extreme within ±k bars.
function swingPoints(candles: TACandle[], k = 3): { highs: number[]; lows: number[] } {
  const highs: number[] = [], lows: number[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push(candles[i].high);
    if (isLow) lows.push(candles[i].low);
  }
  return { highs, lows };
}

function analyzeTrend(highs: number[], lows: number[]): TrendResult {
  const lastHighs = highs.slice(-3);
  const lastLows = lows.slice(-3);
  if (lastHighs.length < 2 || lastLows.length < 2) {
    return { direction: 'range', strength: 'weak', detail: 'Not enough swing points to classify a trend.' };
  }
  const higherHighs = lastHighs[lastHighs.length - 1] > lastHighs[lastHighs.length - 2];
  const higherLows = lastLows[lastLows.length - 1] > lastLows[lastLows.length - 2];
  const lowerHighs = lastHighs[lastHighs.length - 1] < lastHighs[lastHighs.length - 2];
  const lowerLows = lastLows[lastLows.length - 1] < lastLows[lastLows.length - 2];

  if (higherHighs && higherLows)
    return { direction: 'uptrend', strength: 'strong', detail: 'Higher highs and higher lows — confirmed uptrend.' };
  if (lowerHighs && lowerLows)
    return { direction: 'downtrend', strength: 'strong', detail: 'Lower highs and lower lows — confirmed downtrend.' };
  if (higherLows && !lowerHighs)
    return { direction: 'uptrend', strength: 'moderate', detail: 'Higher lows but capped highs — weak/early uptrend.' };
  if (lowerHighs && !higherLows)
    return { direction: 'downtrend', strength: 'moderate', detail: 'Lower highs but holding lows — weak/early downtrend.' };
  return { direction: 'range', strength: 'weak', detail: 'Mixed swings — ranging / no clear trend.' };
}

// Cluster swing prices into horizontal levels; classify vs current price.
function findLevels(highs: number[], lows: number[], price: number): SRLevel[] {
  const all = [...highs, ...lows].sort((a, b) => a - b);
  if (all.length === 0) return [];
  const tol = price * 0.012; // 1.2% banding
  const clusters: number[][] = [];
  for (const p of all) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p - last[last.length - 1]) <= tol) last.push(p);
    else clusters.push([p]);
  }
  const levels: SRLevel[] = clusters.map((c) => {
    const lvl = c.reduce((a, b) => a + b, 0) / c.length;
    return {
      price: lvl,
      kind: lvl < price ? 'support' : 'resistance',
      touches: c.length,
      distancePct: ((lvl - price) / price) * 100,
    };
  });
  const support = levels.filter((l) => l.kind === 'support').sort((a, b) => b.price - a.price).slice(0, 3);
  const resistance = levels.filter((l) => l.kind === 'resistance').sort((a, b) => a.price - b.price).slice(0, 3);
  return [...support, ...resistance].sort((a, b) => a.price - b.price);
}

function analyzeMAs(closes: number[], price: number): MAResult {
  const ma20 = sma(closes, 20), ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  let stack: MAResult['stack'] = 'mixed';
  if (ma20 && ma50 && ma200) {
    if (price > ma20 && ma20 > ma50 && ma50 > ma200) stack = 'bullish';
    else if (price < ma20 && ma20 < ma50 && ma50 < ma200) stack = 'bearish';
  }
  const pos: string[] = [];
  if (ma20) pos.push(`${price >= ma20 ? 'above' : 'below'} MA20`);
  if (ma50) pos.push(`${price >= ma50 ? 'above' : 'below'} MA50`);
  if (ma200) pos.push(`${price >= ma200 ? 'above' : 'below'} MA200`);

  // Detect a recent MA20/MA50 cross in the last ~5 bars.
  let cross: string | null = null;
  if (closes.length >= 55) {
    const prev20 = sma(closes.slice(0, -5), 20), prev50 = sma(closes.slice(0, -5), 50);
    if (ma20 && ma50 && prev20 && prev50) {
      if (prev20 <= prev50 && ma20 > ma50) cross = 'Golden cross (MA20 crossed above MA50) — recent bullish signal.';
      else if (prev20 >= prev50 && ma20 < ma50) cross = 'Death cross (MA20 crossed below MA50) — recent bearish signal.';
    }
  }
  return { ma20, ma50, ma200, stack, pricePosition: pos.join(', '), cross };
}

function analyzeVolume(candles: TACandle[]): VolumeResult {
  const vols = candles.map((c) => c.volume);
  const latest = vols[vols.length - 1] ?? 0;
  const avg20 = sma(vols, 20) ?? (vols.reduce((a, b) => a + b, 0) / Math.max(1, vols.length));
  const ratio = avg20 > 0 ? latest / avg20 : 1;
  const last = candles[candles.length - 1];
  const dir = last && last.close >= last.open ? 'up' : 'down';
  let confirmation: string;
  if (ratio >= 1.3) confirmation = `High volume (${ratio.toFixed(2)}× avg) — the ${dir} move is volume-confirmed.`;
  else if (ratio <= 0.6) confirmation = `Low volume (${ratio.toFixed(2)}× avg) — the ${dir} move lacks conviction; breakouts here often fail.`;
  else confirmation = `Average volume (${ratio.toFixed(2)}× avg) — neutral participation.`;
  return { latest, avg20, ratio, confirmation };
}

/**
 * Run the full technical read on a candle series (newest last).
 * @param btcCloses optional aligned BTC closes for correlation/beta.
 * @param isBTC true when analysing BTC itself (skip self-correlation).
 */
export function analyzeTechnicals(
  candles: TACandle[],
  btcCloses?: number[],
  isBTC = false
): TechnicalAnalysis | null {
  if (candles.length < 20) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const { highs, lows } = swingPoints(candles);

  let correlation: CorrelationResult = { withBTC: null, beta: null, note: 'No correlation data.' };
  if (isBTC) {
    correlation = { withBTC: 1, beta: 1, note: 'BTC is the market benchmark.' };
  } else if (btcCloses && btcCloses.length >= 10) {
    const r = pearson(dailyReturns(closes), dailyReturns(btcCloses));
    const b = beta(dailyReturns(closes), dailyReturns(btcCloses));
    if (r !== null) {
      const strength = Math.abs(r) > 0.7 ? 'strongly' : Math.abs(r) > 0.4 ? 'moderately' : 'weakly';
      correlation = {
        withBTC: r,
        beta: b,
        note: `${strength} correlated with BTC (r=${r.toFixed(2)}${b !== null ? `, β=${b.toFixed(2)}` : ''}) — moves are ${Math.abs(r) > 0.7 ? 'largely BTC-driven' : 'partly idiosyncratic'}.`,
      };
    }
  }

  const rsi = closes.length >= 15 ? calculateRSI(closes, 14) : NaN;
  const macd = closes.length >= 35 ? calculateMACD(closes, 12, 26, 9) : null;
  const momentum: MomentumResult = {
    rsi: isNaN(rsi) ? null : rsi,
    rsiState: !isNaN(rsi) && rsi > 70 ? 'overbought' : !isNaN(rsi) && rsi < 30 ? 'oversold' : 'neutral',
    macdHistogram: macd ? macd.histogram : null,
    macdState: macd ? (macd.histogram > 0.0001 ? 'bullish' : macd.histogram < -0.0001 ? 'bearish' : 'flat') : 'flat',
  };

  return {
    asOf: candles[candles.length - 1].time,
    price,
    trend: analyzeTrend(highs, lows),
    levels: findLevels(highs, lows, price),
    movingAverages: analyzeMAs(closes, price),
    volume: analyzeVolume(candles),
    momentum,
    correlation,
  };
}

/** Render the analysis as a compact block for the LLM prompt. */
export function summarizeTechnicals(ta: TechnicalAnalysis, symbol: string): string {
  const f = (n: number | null) => (n === null ? 'n/a' : n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2));
  const lvls = ta.levels.length
    ? ta.levels
        .map((l) => `${l.kind === 'support' ? 'S' : 'R'} $${f(l.price)} (${l.distancePct >= 0 ? '+' : ''}${l.distancePct.toFixed(1)}%, ${l.touches} touch${l.touches > 1 ? 'es' : ''})`)
        .join('; ')
    : 'none detected';
  const ma = ta.movingAverages;
  return [
    `TECHNICAL READ (computed, ${new Date(ta.asOf).toISOString().slice(0, 10)}) — use these as ground truth:`,
    `• Trend: ${ta.trend.direction} (${ta.trend.strength}) — ${ta.trend.detail}`,
    `• Support/Resistance: ${lvls}`,
    `• Moving avgs: MA20 ${f(ma.ma20)}, MA50 ${f(ma.ma50)}, MA200 ${f(ma.ma200)} | stack: ${ma.stack} | price ${ma.pricePosition}${ma.cross ? ` | ${ma.cross}` : ''}`,
    `• Momentum: RSI ${ta.momentum.rsi !== null ? ta.momentum.rsi.toFixed(1) : 'n/a'} (${ta.momentum.rsiState}), MACD ${ta.momentum.macdState}`,
    `• Volume: ${ta.volume.confirmation}`,
    `• Correlation: ${ta.correlation.note}`,
  ].join('\n');
}
