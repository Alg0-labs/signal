/**
 * Technical Backtester
 *
 * Replays RSI(14) + MACD(12,26,9) + volume signals over historical daily
 * OHLCV data and simulates long-only trades to measure signal quality.
 *
 * Limitation: only the quantitative/technical component is testable.
 * News sentiment and LLM analysis cannot be replayed historically.
 */

import { getOHLCV, getVolumeHistory } from '../tools/market-data.js'
import { calculateEMA } from '../tools/indicators.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BacktestCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  rsi: number
  macdHistogram: number
  volumeAnomaly: number
  signal: 'BUY' | 'SELL' | 'HOLD'
}

export interface BacktestTrade {
  entryDate: number
  entryPrice: number
  exitDate: number
  exitPrice: number
  exitReason: 'sell_signal' | 'timeout' | 'end_of_data'
  returnPct: number
  holdingDays: number
}

export interface BacktestResult {
  symbol: string
  periodDays: number
  holdingPeriodDays: number
  startDate: number
  endDate: number
  // Signals fired
  buySignals: number
  sellSignals: number
  // Trade metrics
  totalTrades: number
  wins: number
  losses: number
  winRatePct: number
  avgReturnPct: number
  bestTradePct: number
  worstTradePct: number
  // Portfolio metrics
  compoundReturnPct: number
  maxDrawdownPct: number
  // Data
  equityCurve: Array<{ date: number; value: number }>
  trades: BacktestTrade[]
  candles: BacktestCandle[]
  dataNote: string
}

// ── Indicator series helpers ──────────────────────────────────────────────────

/** Compute RSI at every candle using Wilder smoothing — O(n). */
function computeRSISeries(closes: number[], period = 14): number[] {
  const result = new Array<number>(closes.length).fill(NaN)
  if (closes.length < period + 1) return result

  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

/** Compute MACD histogram at every candle — O(n). */
function computeMACDHistogramSeries(closes: number[], fast = 12, slow = 26, signal = 9): number[] {
  const emaFast = calculateEMA(closes, fast)
  const emaSlow = calculateEMA(closes, slow)

  const macdValues: number[] = []
  const macdAt: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
      macdValues.push(emaFast[i] - emaSlow[i])
      macdAt.push(i)
    }
  }

  const signalLine = calculateEMA(macdValues, signal)
  const histogram = new Array<number>(closes.length).fill(NaN)
  macdAt.forEach((idx, j) => {
    if (!isNaN(signalLine[j])) {
      histogram[idx] = macdValues[j] - signalLine[j]
    }
  })
  return histogram
}

// ── Signal classification ─────────────────────────────────────────────────────

function classifySignal(
  rsi: number,
  macdHist: number,
  prevMacdHist: number,
  volumeAnomaly: number,
): 'BUY' | 'SELL' | 'HOLD' {
  if (isNaN(rsi) || isNaN(macdHist)) return 'HOLD'

  const bullishCross = !isNaN(prevMacdHist) && prevMacdHist < 0 && macdHist >= 0
  const bearishCross = !isNaN(prevMacdHist) && prevMacdHist > 0 && macdHist <= 0
  const volBoost = volumeAnomaly >= 1.5

  // Strong BUY: oversold RSI + positive MACD momentum
  if (rsi < 30 && macdHist > 0) return 'BUY'
  // MACD bullish crossover while not overbought
  if (bullishCross && rsi < 65) return 'BUY'
  // RSI deeply oversold alone (no MACD needed if extreme)
  if (rsi < 25 && volBoost) return 'BUY'

  // Strong SELL: overbought RSI + negative MACD momentum
  if (rsi > 70 && macdHist < 0) return 'SELL'
  // MACD bearish crossover while elevated RSI
  if (bearishCross && rsi > 45) return 'SELL'

  return 'HOLD'
}

// ── Trade simulation ──────────────────────────────────────────────────────────

function simulateTrades(candles: BacktestCandle[], holdingPeriodDays: number): BacktestTrade[] {
  const trades: BacktestTrade[] = []
  let inPosition = false
  let entryDate = 0
  let entryPrice = 0
  let entryIdx = 0

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]

    if (inPosition) {
      const holdingDays = i - entryIdx
      const isLast = i === candles.length - 1
      const shouldExit = holdingDays >= holdingPeriodDays || c.signal === 'SELL' || isLast

      if (shouldExit) {
        trades.push({
          entryDate,
          entryPrice,
          exitDate: c.time,
          exitPrice: c.close,
          exitReason: c.signal === 'SELL' ? 'sell_signal' : isLast ? 'end_of_data' : 'timeout',
          returnPct: ((c.close - entryPrice) / entryPrice) * 100,
          holdingDays,
        })
        inPosition = false
      }
    } else {
      if (c.signal === 'BUY') {
        // Enter at next candle's open if available (more realistic)
        const next = candles[i + 1]
        entryPrice = next ? next.open : c.close
        entryDate = next ? next.time : c.time
        entryIdx = next ? i + 1 : i
        inPosition = true
        i = next ? i : i  // don't skip, next loop iteration will be i+1
      }
    }
  }

  return trades
}

// ── Equity curve + metrics ────────────────────────────────────────────────────

function computeMetrics(trades: BacktestTrade[], startDate: number, initialCapital = 10_000) {
  const wins = trades.filter(t => t.returnPct > 0).length
  const losses = trades.length - wins
  const winRatePct = trades.length > 0 ? (wins / trades.length) * 100 : 0
  const avgReturnPct = trades.length > 0
    ? trades.reduce((s, t) => s + t.returnPct, 0) / trades.length
    : 0
  const bestTradePct = trades.length > 0 ? Math.max(...trades.map(t => t.returnPct)) : 0
  const worstTradePct = trades.length > 0 ? Math.min(...trades.map(t => t.returnPct)) : 0

  // Equity curve
  let capital = initialCapital
  const equityCurve: Array<{ date: number; value: number }> = [
    { date: startDate, value: initialCapital },
  ]
  for (const t of trades) {
    capital = capital * (1 + t.returnPct / 100)
    equityCurve.push({ date: t.exitDate, value: parseFloat(capital.toFixed(2)) })
  }

  // Max drawdown
  let peak = initialCapital
  let maxDrawdownPct = 0
  for (const p of equityCurve) {
    if (p.value > peak) peak = p.value
    const dd = ((peak - p.value) / peak) * 100
    if (dd > maxDrawdownPct) maxDrawdownPct = dd
  }

  const compoundReturnPct = ((capital - initialCapital) / initialCapital) * 100

  return { wins, losses, winRatePct, avgReturnPct, bestTradePct, worstTradePct, compoundReturnPct, maxDrawdownPct, equityCurve }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runBacktest(
  symbol: string,
  holdingPeriodDays: number,
  periodDays = 90,
): Promise<BacktestResult> {
  const [ohlcvResult, volResult] = await Promise.allSettled([
    getOHLCV(symbol, periodDays),
    getVolumeHistory(symbol, periodDays),
  ])

  if (ohlcvResult.status === 'rejected') {
    throw new Error(`Failed to fetch OHLCV data for ${symbol}: ${ohlcvResult.reason}`)
  }

  const rawCandles = ohlcvResult.value
  if (rawCandles.length < 35) {
    throw new Error(`Insufficient historical data for ${symbol} (need ≥35 candles, got ${rawCandles.length})`)
  }

  const volumes = volResult.status === 'fulfilled' ? volResult.value : []

  // Volume lookup: day-string → volume
  const volByDay = new Map<string, number>()
  for (const v of volumes) {
    volByDay.set(new Date(v.time).toDateString(), v.volume)
  }

  // Compute indicator series from close prices
  const closes = rawCandles.map(c => c.close)
  const rsiSeries = computeRSISeries(closes)
  const macdHistSeries = computeMACDHistogramSeries(closes)

  // Build annotated candles
  const candles: BacktestCandle[] = rawCandles.map((c, i) => {
    const dayKey = new Date(c.time).toDateString()
    const volume = volByDay.get(dayKey) ?? 0

    // 7-day rolling average volume
    let volSum = 0, volCount = 0
    for (let j = Math.max(0, i - 7); j < i; j++) {
      const v = volByDay.get(new Date(rawCandles[j].time).toDateString()) ?? 0
      if (v > 0) { volSum += v; volCount++ }
    }
    const avgVol = volCount > 0 ? volSum / volCount : 0
    const volumeAnomaly = avgVol > 0 && volume > 0 ? volume / avgVol : 1

    const rsi = rsiSeries[i]
    const macdHist = macdHistSeries[i]
    const prevMacdHist = i > 0 ? macdHistSeries[i - 1] : NaN
    const signal = classifySignal(rsi, macdHist, prevMacdHist, volumeAnomaly)

    return {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume,
      rsi: isNaN(rsi) ? 50 : parseFloat(rsi.toFixed(2)),
      macdHistogram: isNaN(macdHist) ? 0 : parseFloat(macdHist.toFixed(6)),
      volumeAnomaly: parseFloat(volumeAnomaly.toFixed(2)),
      signal,
    }
  })

  const buySignals = candles.filter(c => c.signal === 'BUY').length
  const sellSignals = candles.filter(c => c.signal === 'SELL').length

  const trades = simulateTrades(candles, holdingPeriodDays)
  const metrics = computeMetrics(trades, candles[0].time)

  return {
    symbol,
    periodDays,
    holdingPeriodDays,
    startDate: candles[0].time,
    endDate: candles[candles.length - 1].time,
    buySignals,
    sellSignals,
    totalTrades: trades.length,
    trades,
    candles,
    dataNote: 'Uses RSI(14) + MACD(12,26,9) + volume on daily candles. News, Fear & Greed, and LLM signals cannot be replayed historically — real system accuracy will differ.',
    ...metrics,
  }
}
