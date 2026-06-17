import { getOHLCV, getMarketData } from '../tools/market-data.js';
import { calculateRSI, calculateMACD } from '../tools/indicators.js';
import type { MomentumSignal } from '../types.js';

const DEFAULT_MOMENTUM: MomentumSignal = {
  rsi: 50,
  macd: { value: 0, signal: 0, histogram: 0 },
  trend: 'neutral',
  priceChange24h: 0,
  confidence: 0.3,
};

export async function checkMomentum(symbol: string): Promise<MomentumSignal> {
  try {
    // 60 daily candles: enough for a stable RSI-14 and MACD(12,26,9) signal line.
    // (Old code requested 14 — below the >=15 floor below — so momentum always
    // fell back to the neutral default. Binance has no rate limit, so fetch wide.)
    const [candles, marketData] = await Promise.allSettled([
      getOHLCV(symbol, 60),
      getMarketData(symbol),
    ]);

    const ohlcv = candles.status === 'fulfilled' ? candles.value : [];
    const market = marketData.status === 'fulfilled' ? marketData.value : null;

    if (ohlcv.length < 15) {
      console.log(`[copilot][momentum] Insufficient OHLCV data for ${symbol}: ${ohlcv.length} candles`);
      return {
        ...DEFAULT_MOMENTUM,
        priceChange24h: market?.change24h ?? 0,
      };
    }

    const closes = ohlcv.map((c) => c.close);

    const rsi = calculateRSI(closes, 14);
    const macdResult = calculateMACD(closes, 12, 26, 9);

    const priceChange24h = market?.change24h ?? 0;

    // Determine trend
    let trend: MomentumSignal['trend'] = 'neutral';
    if (!isNaN(rsi)) {
      if (rsi < 30) trend = 'oversold';
      else if (rsi > 70) trend = 'overbought';
    }

    // Confidence: data quality + indicator agreement
    let confidence = 0.4;
    if (ohlcv.length >= 30) confidence += 0.1;
    if (!isNaN(rsi)) confidence += 0.1;
    if (!isNaN(macdResult.macd)) confidence += 0.1;

    // Indicator agreement bonus
    const macdBullish = macdResult.histogram > 0;
    const rsiBullish = !isNaN(rsi) && rsi > 50;
    const priceChangeBullish = priceChange24h > 0;
    const agreements = [macdBullish, rsiBullish, priceChangeBullish].filter(Boolean).length;
    if (agreements === 3 || agreements === 0) confidence += 0.1; // strong agreement

    confidence = Math.min(0.9, Math.max(0.3, confidence));

    const rsiValue = isNaN(rsi) ? 50 : rsi;
    const macdValue = isNaN(macdResult.macd) ? 0 : macdResult.macd;
    const macdSignal = isNaN(macdResult.signal) ? 0 : macdResult.signal;
    const macdHistogram = isNaN(macdResult.histogram) ? 0 : macdResult.histogram;

    console.log(
      `[copilot][momentum] ${symbol} — RSI: ${rsiValue.toFixed(1)}, MACD: ${macdValue.toFixed(4)}, trend: ${trend}, confidence: ${confidence.toFixed(2)}`
    );

    return {
      rsi: rsiValue,
      macd: { value: macdValue, signal: macdSignal, histogram: macdHistogram },
      trend,
      priceChange24h,
      confidence,
    };
  } catch (err) {
    console.error(`[copilot][momentum] checkMomentum error for ${symbol}:`, err);
    return DEFAULT_MOMENTUM;
  }
}
