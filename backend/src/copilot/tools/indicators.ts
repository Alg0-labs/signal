/**
 * Pure technical indicator calculations — no external dependencies.
 */

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  bandWidth: number;
}

/**
 * Calculate RSI (Relative Strength Index) using the Wilder smoothing method.
 * Returns NaN if there is insufficient data.
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return NaN;

  let gains = 0;
  let losses = 0;

  // Initial average over first period
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder smoothing for remaining prices
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate EMA (Exponential Moving Average).
 * Returns an array of the same length as prices; initial values use SMA.
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = new Array(prices.length).fill(NaN);

  // Seed with SMA of first `period` values
  if (prices.length < period) {
    // Not enough data — return array of NaN
    return ema;
  }

  const seedSMA = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema[period - 1] = seedSMA;

  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }

  return ema;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence).
 * Returns NaN values if there is insufficient data.
 */
export function calculateMACD(
  prices: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): MACDResult {
  const nan: MACDResult = { macd: NaN, signal: NaN, histogram: NaN };
  if (prices.length < slow + signal) return nan;

  const emaFast = calculateEMA(prices, fast);
  const emaSlow = calculateEMA(prices, slow);

  // Compute MACD line
  const macdLine: number[] = [];
  const macdIndices: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (!isNaN(f) && !isNaN(s)) {
      macdLine.push(f - s);
      macdIndices.push(i);
    }
  }

  if (macdLine.length < signal) return nan;

  const signalEMA = calculateEMA(macdLine, signal);
  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalEMA[signalEMA.length - 1];

  if (isNaN(lastSignal)) return nan;

  return {
    macd: lastMACD,
    signal: lastSignal,
    histogram: lastMACD - lastSignal,
  };
}

/**
 * Calculate Bollinger Bands.
 * Returns NaN values if there is insufficient data.
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  multiplier: number = 2
): BollingerBandsResult {
  const nan: BollingerBandsResult = { upper: NaN, middle: NaN, lower: NaN, bandWidth: NaN };
  if (prices.length < period) return nan;

  const slice = prices.slice(prices.length - period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const stddev = Math.sqrt(variance);

  const upper = sma + multiplier * stddev;
  const lower = sma - multiplier * stddev;
  const bandWidth = sma > 0 ? (upper - lower) / sma : 0;

  return { upper, middle: sma, lower, bandWidth };
}

/**
 * Calculate ATR (Average True Range).
 * Returns NaN if there is insufficient data.
 */
export function calculateATR(
  ohlcv: { high: number; low: number; close: number }[],
  period: number = 14
): number {
  if (ohlcv.length < period + 1) return NaN;

  const trueRanges: number[] = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const { high, low } = ohlcv[i];
    const prevClose = ohlcv[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return NaN;

  // Wilder smoothing ATR
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}
