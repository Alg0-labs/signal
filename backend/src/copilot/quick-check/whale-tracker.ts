import { getVolumeHistory, getMarketData } from '../tools/market-data.js';
import type { WhaleActivity } from '../types.js';

const DEFAULT_WHALE: WhaleActivity = {
  volumeAnomaly: 1,
  direction: 'neutral',
  alert: false,
  netFlow: 'neutral',
  confidence: 0.3,
};

export async function trackWhales(symbol: string): Promise<WhaleActivity> {
  try {
    const [volumeHistResult, marketResult] = await Promise.allSettled([
      getVolumeHistory(symbol, 7),
      getMarketData(symbol),
    ]);

    const volumeHistory = volumeHistResult.status === 'fulfilled' ? volumeHistResult.value : [];
    const market = marketResult.status === 'fulfilled' ? marketResult.value : null;

    if (volumeHistory.length === 0 || !market) {
      console.log(`[copilot][whales] Insufficient data for ${symbol}`);
      return DEFAULT_WHALE;
    }

    // Calculate average daily volume over the 7-day history
    // Exclude the last entry (today, may be incomplete)
    const historicalVolumes = volumeHistory.slice(0, -1).map((v) => v.volume);
    if (historicalVolumes.length === 0) {
      return DEFAULT_WHALE;
    }

    const avgVolume = historicalVolumes.reduce((a, b) => a + b, 0) / historicalVolumes.length;
    const todayVolume = market.volume24h;

    const volumeAnomaly = avgVolume > 0 ? todayVolume / avgVolume : 1;
    const alert = volumeAnomaly > 2.0 || volumeAnomaly < 0.5;

    // Direction logic:
    // Price up AND volume high → accumulation
    // Price down AND volume high → distribution
    // Otherwise neutral
    const priceChange24h = market.change24h;
    let direction: WhaleActivity['direction'] = 'neutral';

    if (volumeAnomaly > 1.3) {
      if (priceChange24h > 1) direction = 'accumulation';
      else if (priceChange24h < -1) direction = 'distribution';
    }

    // Net flow: based on price change proxy
    let netFlow: WhaleActivity['netFlow'] = 'neutral';
    if (priceChange24h > 2) netFlow = 'inflow';
    else if (priceChange24h < -2) netFlow = 'outflow';

    // Confidence: volume is a proxy, not direct on-chain
    let confidence = 0.4;
    if (historicalVolumes.length >= 5) confidence += 0.1;
    if (volumeHistory.length >= 7) confidence += 0.1;
    if (Math.abs(volumeAnomaly - 1) > 0.5) confidence += 0.05; // clear signal
    confidence = Math.min(0.75, confidence);

    console.log(
      `[copilot][whales] ${symbol} — anomaly: ${volumeAnomaly.toFixed(2)}x, direction: ${direction}, netFlow: ${netFlow}, alert: ${alert}`
    );

    return {
      volumeAnomaly,
      direction,
      alert,
      netFlow,
      confidence,
    };
  } catch (err) {
    console.error(`[copilot][whales] trackWhales error for ${symbol}:`, err);
    return DEFAULT_WHALE;
  }
}
