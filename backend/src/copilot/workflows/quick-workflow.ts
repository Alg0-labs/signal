import { checkMomentum } from '../quick-check/momentum-check.js';
import { getSentimentPulse } from '../quick-check/sentiment-pulse.js';
import { trackWhales } from '../quick-check/whale-tracker.js';
import { scanNews } from '../quick-check/news-scanner.js';
import type { TradeIntent, QuickCheckResult, MomentumSignal, SentimentPulse, WhaleActivity, NewsImpact } from '../types.js';

const DEFAULT_MOMENTUM: MomentumSignal = {
  rsi: 50,
  macd: { value: 0, signal: 0, histogram: 0 },
  trend: 'neutral',
  priceChange24h: 0,
  confidence: 0.3,
};

const DEFAULT_SENTIMENT: SentimentPulse = {
  score: 0,
  fearGreedIndex: 50,
  fearGreedLabel: 'Neutral',
  trending: false,
  shift: 'neutral',
  confidence: 0.3,
};

const DEFAULT_WHALES: WhaleActivity = {
  volumeAnomaly: 1,
  direction: 'neutral',
  alert: false,
  netFlow: 'neutral',
  confidence: 0.3,
};

const DEFAULT_NEWS: NewsImpact = {
  hasBreakingNews: false,
  sentiment: 'neutral',
  importance: 'low',
  headlines: [],
  confidence: 0.3,
};

function computeSeverityScore(
  momentum: MomentumSignal,
  sentiment: SentimentPulse,
  whales: WhaleActivity,
  news: NewsImpact,
  action: 'BUY' | 'SELL'
): number {
  let score = 0;
  const rsi = momentum.rsi;

  // RSI signals
  if (rsi < 25) score += 3; // deeply oversold - risky for SELL, opportunity for BUY
  else if (rsi > 75) score += 3; // extremely overbought - risky for BUY
  else if (rsi < 30 || rsi > 70) score += 1; // mildly extreme

  // Whale signals
  if (whales.direction === 'distribution' && action === 'BUY') score += 3;
  if (whales.volumeAnomaly > 3) score += 2; // very unusual volume

  // News signals
  if (news.sentiment === 'negative' && news.importance === 'high') score += 3;
  if (news.hasBreakingNews && news.sentiment === 'negative') score += 2;

  // Sentiment shifts
  if (sentiment.shift === 'bearish' && action === 'BUY') score += 1;
  if (sentiment.fearGreedIndex < 20 && action === 'BUY') score += 1; // extreme fear
  if (sentiment.fearGreedIndex > 80 && action === 'BUY') score += 2; // extreme greed - risky

  // Adjust for SELL trades (inverse logic)
  if (action === 'SELL') {
    if (rsi < 30) score += 1; // selling oversold — maybe wait
    if (whales.direction === 'distribution') score -= 1; // smart money also selling — confirms
  }

  return Math.max(0, score);
}

function generateInsights(
  momentum: MomentumSignal,
  sentiment: SentimentPulse,
  whales: WhaleActivity,
  news: NewsImpact,
  action: 'BUY' | 'SELL'
): string[] {
  const insights: string[] = [];

  // RSI insight
  if (momentum.rsi < 30) {
    insights.push(`RSI at ${momentum.rsi.toFixed(0)} — asset appears oversold; possible mean-reversion opportunity but momentum is weak`);
  } else if (momentum.rsi > 70) {
    insights.push(`RSI at ${momentum.rsi.toFixed(0)} — asset appears overbought; selling pressure may emerge soon`);
  } else {
    insights.push(`RSI at ${momentum.rsi.toFixed(0)} — momentum is neutral with no extreme readings`);
  }

  // MACD insight
  if (momentum.macd.histogram > 0) {
    insights.push(`MACD histogram is positive (${momentum.macd.histogram.toFixed(4)}) — bullish momentum building`);
  } else if (momentum.macd.histogram < 0) {
    insights.push(`MACD histogram is negative (${momentum.macd.histogram.toFixed(4)}) — bearish momentum building`);
  }

  // Volume/whale insight
  if (whales.volumeAnomaly > 2) {
    insights.push(
      `Volume is ${whales.volumeAnomaly.toFixed(1)}x the 7-day average — ${whales.direction === 'accumulation' ? 'whale accumulation detected' : whales.direction === 'distribution' ? 'potential distribution by large holders' : 'unusual activity'}`
    );
  } else if (whales.volumeAnomaly < 0.5) {
    insights.push(`Volume is unusually low (${whales.volumeAnomaly.toFixed(1)}x avg) — low conviction market`);
  } else {
    insights.push(`Volume is within normal range (${whales.volumeAnomaly.toFixed(1)}x avg) — no significant whale activity`);
  }

  // News sentiment insight
  if (news.headlines.length > 0) {
    const sentimentDesc = news.sentiment === 'positive' ? 'positive' : news.sentiment === 'negative' ? 'negative' : 'mixed';
    insights.push(
      `News sentiment is ${sentimentDesc}${news.hasBreakingNews ? ' — breaking news detected' : ''}. Top headline: "${news.headlines[0]}"`
    );
  } else {
    insights.push('No significant news found for this asset in the last 24h');
  }

  // Fear & Greed insight
  const fg = sentiment.fearGreedIndex;
  if (fg <= 20) {
    insights.push(`Fear & Greed Index at ${fg} (${sentiment.fearGreedLabel}) — extreme fear can signal capitulation; contrarian ${action === 'BUY' ? 'buy' : 'sell'} opportunity for experienced traders`);
  } else if (fg >= 80) {
    insights.push(`Fear & Greed Index at ${fg} (${sentiment.fearGreedLabel}) — extreme greed historically precedes corrections; proceed with caution`);
  } else {
    insights.push(`Fear & Greed Index at ${fg} (${sentiment.fearGreedLabel}) — market sentiment is ${sentiment.shift !== 'neutral' ? `shifting ${sentiment.shift}` : 'stable'}`);
  }

  return insights;
}

export async function quickCheck(trade: TradeIntent): Promise<QuickCheckResult> {
  const start = Date.now();
  const symbol = trade.symbol.toUpperCase();

  console.log(`[copilot][quick] Starting quick check for ${symbol} ${trade.action}`);

  const [momentumResult, sentimentResult, whalesResult, newsResult] = await Promise.allSettled([
    checkMomentum(symbol),
    getSentimentPulse(symbol),
    trackWhales(symbol),
    scanNews(symbol),
  ]);

  const momentum = momentumResult.status === 'fulfilled' ? momentumResult.value : DEFAULT_MOMENTUM;
  const sentiment = sentimentResult.status === 'fulfilled' ? sentimentResult.value : DEFAULT_SENTIMENT;
  const whales = whalesResult.status === 'fulfilled' ? whalesResult.value : DEFAULT_WHALES;
  const news = newsResult.status === 'fulfilled' ? newsResult.value : DEFAULT_NEWS;

  // Compute severity
  const severityScore = computeSeverityScore(momentum, sentiment, whales, news, trade.action);

  let severity: QuickCheckResult['severity'];
  if (severityScore <= 2) severity = 'low';
  else if (severityScore <= 5) severity = 'medium';
  else severity = 'high';

  let recommendation: QuickCheckResult['recommendation'];
  if (severity === 'low') recommendation = 'EXECUTE';
  else if (severity === 'medium') recommendation = 'CAUTION';
  else recommendation = 'AVOID';

  // Overall confidence: weighted average of signal confidences
  const avgConfidence =
    (momentum.confidence + sentiment.confidence + whales.confidence + news.confidence) / 4;
  // Adjust up if signals agree
  const confidence = Math.min(0.95, avgConfidence + (severity === 'low' ? 0.05 : 0));

  // Generate insights
  const insights = generateInsights(momentum, sentiment, whales, news, trade.action);

  // Suggested actions
  let suggestedActions: QuickCheckResult['suggestedActions'];
  if (severity === 'low') {
    suggestedActions = [{ label: 'Execute Trade', action: 'execute' }];
  } else if (severity === 'medium') {
    suggestedActions = [
      { label: 'Execute with Caution', action: 'execute' },
      { label: 'Get Deep Analysis', action: 'analyze' },
      { label: 'Cancel', action: 'wait' },
    ];
  } else {
    suggestedActions = [
      { label: 'Get Full Analysis', action: 'analyze' },
      { label: 'Wait for Better Entry', action: 'wait' },
      { label: 'Set Limit Order', action: 'limit' },
    ];
  }

  const executionTimeMs = Date.now() - start;

  console.log(
    `[copilot][quick] ${symbol} — severity: ${severity}, recommendation: ${recommendation}, score: ${severityScore}, time: ${executionTimeMs}ms`
  );

  return {
    severity,
    recommendation,
    confidence,
    insights,
    signals: { momentum, sentiment, whales, news },
    suggestedActions,
    executionTimeMs,
  };
}
