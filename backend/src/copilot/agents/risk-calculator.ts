import type { TradeIntent, TradingDecision, MomentumSignal, SentimentPulse, WhaleActivity, NewsImpact, RiskAssessment } from '../types.js';
import { calculateATR } from '../tools/indicators.js';

interface SignalSet {
  momentum: MomentumSignal;
  sentiment: SentimentPulse;
  whales: WhaleActivity;
  news: NewsImpact;
}

function computeRiskScore(signals: SignalSet, action: 'BUY' | 'SELL'): number {
  let score = 0;

  // RSI extremes
  const rsi = signals.momentum.rsi;
  if (rsi > 80 && action === 'BUY') score += 3;
  else if (rsi > 70 && action === 'BUY') score += 2;
  else if (rsi < 20 && action === 'SELL') score += 3;
  else if (rsi < 30 && action === 'SELL') score += 2;

  // Volume anomaly
  if (signals.whales.volumeAnomaly > 3) score += 2;
  else if (signals.whales.volumeAnomaly > 2) score += 1;

  // Distribution during BUY
  if (signals.whales.direction === 'distribution' && action === 'BUY') score += 2;

  // Breaking negative news
  if (signals.news.hasBreakingNews && signals.news.sentiment === 'negative') score += 3;
  else if (signals.news.sentiment === 'negative' && signals.news.importance === 'high') score += 2;

  // Extreme fear/greed
  if (signals.sentiment.fearGreedIndex > 85 && action === 'BUY') score += 2;
  if (signals.sentiment.fearGreedIndex < 15) score += 1;

  // Bearish shift
  if (signals.sentiment.shift === 'bearish' && action === 'BUY') score += 1;

  return score;
}

export async function assessRisk(
  trade: TradeIntent,
  decision: TradingDecision,
  signals: SignalSet,
  marketData: any
): Promise<RiskAssessment> {
  const riskScore = computeRiskScore(signals, trade.action);
  const currentPrice = marketData?.market?.price ?? 0;
  const ohlcv = marketData?.ohlcv ?? [];

  // Risk level
  let riskLevel: RiskAssessment['riskLevel'];
  if (riskScore <= 2) riskLevel = 'low';
  else if (riskScore <= 5) riskLevel = 'medium';
  else if (riskScore <= 8) riskLevel = 'high';
  else riskLevel = 'extreme';

  // Position size caps by risk level
  const positionCaps: Record<RiskAssessment['riskLevel'], { max: number; suggested: number }> = {
    low: { max: 30, suggested: 25 },
    medium: { max: 15, suggested: 10 },
    high: { max: 5, suggested: 3 },
    extreme: { max: 2, suggested: 1 },
  };

  // Override with decision conviction
  let { max: maxPositionPct, suggested: suggestedPositionPct } = positionCaps[riskLevel];
  if (decision.conviction === 'strong' && riskLevel !== 'extreme') {
    suggestedPositionPct = Math.min(maxPositionPct, suggestedPositionPct * 1.3);
  } else if (decision.conviction === 'weak') {
    suggestedPositionPct = Math.max(1, suggestedPositionPct * 0.6);
  }

  suggestedPositionPct = parseFloat(suggestedPositionPct.toFixed(1));

  // ATR-based stop loss
  let stopLossPrice: number | undefined;
  let takeProfitPrice: number | undefined;
  let riskRewardRatio: number | undefined;

  if (currentPrice > 0) {
    // Calculate ATR if we have OHLCV data
    let atrMultiplier = 0.05; // default 5% stop
    if (ohlcv.length >= 15) {
      const atr = calculateATR(ohlcv, 14);
      if (!isNaN(atr) && atr > 0) {
        atrMultiplier = atr / currentPrice;
      }
    }

    const stopDistance = Math.min(0.15, Math.max(0.02, atrMultiplier * 2)); // 2x ATR, capped at 15%, min 2%

    if (trade.action === 'BUY') {
      stopLossPrice = parseFloat((currentPrice * (1 - stopDistance)).toFixed(2));
      takeProfitPrice = parseFloat((currentPrice * (1 + stopDistance * 2)).toFixed(2)); // 2:1 R:R
      riskRewardRatio = 2.0;
    } else {
      // SELL (short)
      stopLossPrice = parseFloat((currentPrice * (1 + stopDistance)).toFixed(2));
      takeProfitPrice = parseFloat((currentPrice * (1 - stopDistance * 2)).toFixed(2));
      riskRewardRatio = 2.0;
    }
  }

  // Build warnings
  const warnings: string[] = [];

  if (riskLevel === 'extreme') {
    warnings.push('EXTREME RISK: Multiple high-severity signals detected. Consider avoiding this trade entirely.');
  }

  if (signals.momentum.rsi > 80 && trade.action === 'BUY') {
    warnings.push(`RSI at ${signals.momentum.rsi.toFixed(0)} — extremely overbought, high probability of near-term pullback`);
  }
  if (signals.momentum.rsi < 20 && trade.action === 'SELL') {
    warnings.push(`RSI at ${signals.momentum.rsi.toFixed(0)} — extremely oversold, short squeeze risk is elevated`);
  }

  if (signals.whales.volumeAnomaly > 2) {
    warnings.push(`Volume is ${signals.whales.volumeAnomaly.toFixed(1)}x normal — potential manipulation or large institutional move`);
  }
  if (signals.whales.direction === 'distribution' && trade.action === 'BUY') {
    warnings.push('Whale distribution detected — large holders appear to be selling into this rally');
  }

  if (signals.news.hasBreakingNews && signals.news.sentiment === 'negative') {
    warnings.push('Breaking negative news — high volatility expected; avoid large positions');
  }

  if (signals.sentiment.fearGreedIndex > 80 && trade.action === 'BUY') {
    warnings.push(`Fear & Greed at ${signals.sentiment.fearGreedIndex} (Extreme Greed) — historically a reversal warning sign`);
  }

  if (trade.portfolioContext?.riskTolerance === 'low' && riskLevel !== 'low') {
    warnings.push(`Risk tolerance set to LOW but market conditions show ${riskLevel} risk — reduce position size further`);
  }

  console.log(
    `[copilot][risk] ${trade.symbol} — level: ${riskLevel}, score: ${riskScore}, maxPos: ${maxPositionPct}%, suggested: ${suggestedPositionPct}%`
  );

  return {
    riskLevel,
    maxPositionPct,
    suggestedPositionPct,
    stopLossPrice,
    takeProfitPrice,
    riskRewardRatio,
    warnings,
  };
}
