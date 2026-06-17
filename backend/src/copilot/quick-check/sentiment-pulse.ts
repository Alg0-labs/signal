import { fetchNewsForSymbol, computeNewsSentiment } from '../tools/news-rss.js';
import type { SentimentPulse } from '../types.js';

const DEFAULT_PULSE: SentimentPulse = {
  score: 0,
  fearGreedIndex: 50,
  fearGreedLabel: 'Neutral',
  trending: false,
  shift: 'neutral',
  confidence: 0.3,
};

interface FearGreedEntry {
  value: string;
  value_classification: string;
  timestamp: string;
}

async function fetchFearGreed(): Promise<{ current: FearGreedEntry; yesterday: FearGreedEntry | null }> {
  const res = await fetch('https://api.alternative.me/fng/?limit=2', {
    signal: AbortSignal.timeout(6000),
    headers: { 'User-Agent': 'Oracle-Copilot/1.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fear & Greed API: ${res.status}`);
  const json = await res.json() as { data?: FearGreedEntry[] };
  if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('No F&G data');
  return { current: json.data[0], yesterday: json.data[1] ?? null };
}

export async function getSentimentPulse(symbol: string): Promise<SentimentPulse> {
  try {
    // Run news fetch + Fear & Greed in parallel (no CryptoPanic dependency)
    const [newsResult, fgResult] = await Promise.allSettled([
      fetchNewsForSymbol(symbol),
      fetchFearGreed(),
    ]);

    const articles = newsResult.status === 'fulfilled' ? newsResult.value : [];
    const fg = fgResult.status === 'fulfilled' ? fgResult.value : null;

    // Sentiment from RSS news keyword analysis
    const { score: newsScore, positiveCount, negativeCount } = computeNewsSentiment(articles);

    const fearGreedIndex = fg ? Number(fg.current.value) : 50;
    const fearGreedLabel = fg ? fg.current.value_classification : 'Neutral';

    // Trending: 5+ articles found
    const trending = articles.length >= 5;

    // Shift: Fear & Greed day-over-day diff (primary), news score (secondary)
    let shift: SentimentPulse['shift'] = 'neutral';
    if (fg?.yesterday) {
      const diff = fearGreedIndex - Number(fg.yesterday.value);
      if (diff >= 5) shift = 'bullish';
      else if (diff <= -5) shift = 'bearish';
    }
    if (shift === 'neutral') {
      if (newsScore > 0.25) shift = 'bullish';
      else if (newsScore < -0.25) shift = 'bearish';
    }

    // Confidence: scales with data quality
    let confidence = 0.5;
    if (fg !== null) confidence += 0.15;
    if (articles.length >= 3) confidence += 0.1;
    if (articles.length >= 7) confidence += 0.1;
    if (positiveCount + negativeCount >= 3) confidence += 0.05;
    confidence = Math.min(0.9, confidence);

    console.log(
      `[copilot][sentiment] ${symbol} — score: ${newsScore.toFixed(2)}, F&G: ${fearGreedIndex} (${fearGreedLabel}), shift: ${shift}, trending: ${trending}`
    );

    return { score: newsScore, fearGreedIndex, fearGreedLabel, trending, shift, confidence };
  } catch (err) {
    console.error(`[copilot][sentiment] error for ${symbol}:`, err);
    return DEFAULT_PULSE;
  }
}
