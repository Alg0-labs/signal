import Anthropic from '@anthropic-ai/sdk';
import type { TradeIntent, AnalystReport } from '../types.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseSignal(text: string): 'bullish' | 'bearish' | 'neutral' {
  const match = text.match(/<signal>(bullish|bearish|neutral)<\/signal>/i);
  if (match) return match[1].toLowerCase() as 'bullish' | 'bearish' | 'neutral';
  const lower = text.toLowerCase();
  if (lower.includes('bullish')) return 'bullish';
  if (lower.includes('bearish')) return 'bearish';
  return 'neutral';
}

function parseConfidence(text: string): number {
  const match = text.match(/<confidence>([\d.]+)<\/confidence>/);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return Math.min(1, Math.max(0, val));
  }
  return 0.5;
}

function parseFindings(text: string): string[] {
  const match = text.match(/<findings>([\s\S]*?)<\/findings>/);
  if (!match) return [text.slice(0, 200)];
  return match[1]
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 5);
}

function parseReasoning(text: string): string {
  const match = text.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
  if (match) return match[1].trim().slice(0, 500);
  return text.slice(0, 300);
}

export async function analyzeNews(trade: TradeIntent, newsData: any): Promise<AnalystReport> {
  const symbol = trade.symbol.toUpperCase();
  const timestamp = new Date().toISOString();

  const impact = newsData?.impact ?? {};
  // Merge quick-check headlines with deeper headlines from shared memory
  const allHeadlines = [
    ...(impact.headlines ?? []),
    ...(newsData?.topHeadlines ?? []),
  ].filter((h, i, arr) => arr.indexOf(h) === i).slice(0, 5)
  const headlinesList = allHeadlines.join('\n- ') || 'No recent headlines'
  const cmcSection = newsData?.cmcContext
    ? `\nCOINMARKETCAP CONTEXT:\n${newsData.cmcContext}\n`
    : ''

  const prompt = `You are a crypto news and fundamental analyst. Assess the news impact on ${symbol} for a potential ${trade.action} trade.

NEWS DATA:
- Breaking News Alert: ${impact.hasBreakingNews ? 'YES' : 'No'}
- Overall News Sentiment: ${impact.sentiment ?? 'neutral'}
- News Importance Level: ${impact.importance ?? 'low'}
- Recent Headlines:
- ${headlinesList}
${cmcSection}

Analyze:
1. Whether any news could cause a price spike or dump
2. Macro or regulatory risks visible in headlines
3. Fundamental catalysts (partnerships, upgrades, listings)
4. Market-moving potential of current news cycle
5. How news sentiment aligns with the proposed ${trade.action}

Respond ONLY in this format:
<signal>bullish|bearish|neutral</signal>
<confidence>0.0-1.0</confidence>
<findings>
- Finding 1
- Finding 2
- Finding 3
- Finding 4
- Finding 5
</findings>
<reasoning>
2-3 sentence reasoning for your news-based ${trade.action} signal.
</reasoning>`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const signal = parseSignal(text);
    const confidence = parseConfidence(text);
    const keyFindings = parseFindings(text);
    const reasoning = parseReasoning(text);

    return {
      analyst: 'news',
      timestamp,
      asset: symbol,
      keyFindings,
      metrics: {
        hasBreakingNews: impact.hasBreakingNews ? 1 : 0,
        newsSentiment: impact.sentiment ?? 'neutral',
        newsImportance: impact.importance ?? 'low',
        headlineCount: (impact.headlines ?? []).length,
      },
      signal,
      confidence,
      reasoning,
    };
  } catch (err) {
    console.error(`[copilot][news-analyst] Error for ${symbol}:`, err);
    return {
      analyst: 'news',
      timestamp,
      asset: symbol,
      keyFindings: ['News analysis unavailable due to API error'],
      metrics: {},
      signal: 'neutral',
      confidence: 0.3,
      reasoning: 'News analysis could not be completed. Treat as neutral.',
    };
  }
}
