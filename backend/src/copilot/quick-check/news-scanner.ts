import { fetchNewsForSymbol, computeNewsSentiment } from '../tools/news-rss.js';
import type { NewsImpact } from '../types.js';

const DEFAULT_NEWS: NewsImpact = {
  hasBreakingNews: false,
  sentiment: 'neutral',
  importance: 'low',
  headlines: [],
  confidence: 0.3,
};

export async function scanNews(symbol: string): Promise<NewsImpact> {
  try {
    const articles = await fetchNewsForSymbol(symbol);

    if (articles.length === 0) {
      console.log(`[copilot][news] No articles found for ${symbol}`);
      return DEFAULT_NEWS;
    }

    // Breaking news: any 'high' importance article in last 24h
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const hasBreakingNews = articles.some(
      a => a.importance === 'high' && a.publishedAt > oneDayAgo
    );

    // Importance: based on high-importance article count
    const highCount = articles.filter(a => a.importance === 'high').length;
    let importance: NewsImpact['importance'] = 'low';
    if (highCount >= 2 || hasBreakingNews) importance = 'high';
    else if (highCount >= 1 || articles.length >= 5) importance = 'medium';

    // Sentiment from article keywords
    const { score, positiveCount, negativeCount } = computeNewsSentiment(articles);
    let sentiment: NewsImpact['sentiment'] = 'neutral';
    if (score > 0.15) sentiment = 'positive';
    else if (score < -0.15) sentiment = 'negative';

    // Top 3 headlines
    const headlines = articles
      .slice(0, 3)
      .map(a => (a.title.length > 100 ? a.title.slice(0, 97) + '...' : a.title));

    // Confidence: scales with data volume
    let confidence = 0.55;
    if (articles.length >= 3) confidence += 0.1;
    if (articles.length >= 7) confidence += 0.1;
    if (hasBreakingNews) confidence += 0.1;
    confidence = Math.min(0.9, confidence);

    console.log(
      `[copilot][news] ${symbol} — articles: ${articles.length}, pos: ${positiveCount}, neg: ${negativeCount}, sentiment: ${sentiment}, importance: ${importance}, breaking: ${hasBreakingNews}`
    );

    return { hasBreakingNews, sentiment, importance, headlines, confidence };
  } catch (err) {
    console.error(`[copilot][news] scanNews error for ${symbol}:`, err);
    return DEFAULT_NEWS;
  }
}
