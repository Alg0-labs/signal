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

export async function analyzeSentiment(trade: TradeIntent, sentimentData: any): Promise<AnalystReport> {
  const symbol = trade.symbol.toUpperCase();
  const timestamp = new Date().toISOString();

  const fg = sentimentData?.fearGreed ?? {};
  const pulse = sentimentData?.pulse ?? {};

  const prompt = `You are a crypto market sentiment analyst. Evaluate the current sentiment environment for ${symbol} and assess whether it supports a ${trade.action} trade.

SENTIMENT DATA:
- Fear & Greed Index: ${fg.value ?? 50}/100 (${fg.label ?? 'Neutral'})
- Fear & Greed 7-day Trend: ${fg.trend ?? 'Unknown'}
- CryptoPanic Sentiment Score: ${pulse.score?.toFixed(2) ?? '0.00'} (scale: -1 bearish to +1 bullish)
- Sentiment Shift (vs yesterday): ${pulse.shift ?? 'neutral'}
- Asset is Trending: ${pulse.trending ? 'Yes' : 'No'}
- Recent Positive News Count: ${sentimentData?.positiveCount ?? 0}
- Recent Negative News Count: ${sentimentData?.negativeCount ?? 0}

Analyze:
1. What the Fear & Greed level means for this trade
2. CryptoPanic community sentiment direction
3. Whether the sentiment shift supports or contradicts the ${trade.action}
4. Trend momentum vs contrarian signals
5. Risk of sentiment reversal

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
2-3 sentence reasoning for your sentiment-based ${trade.action} signal.
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
      analyst: 'sentiment',
      timestamp,
      asset: symbol,
      keyFindings,
      metrics: {
        fearGreedIndex: fg.value ?? 50,
        fearGreedLabel: fg.label ?? 'Neutral',
        sentimentScore: pulse.score ?? 0,
        trending: pulse.trending ? 1 : 0,
      },
      signal,
      confidence,
      reasoning,
    };
  } catch (err) {
    console.error(`[copilot][sentiment-analyst] Error for ${symbol}:`, err);
    return {
      analyst: 'sentiment',
      timestamp,
      asset: symbol,
      keyFindings: ['Sentiment analysis unavailable due to API error'],
      metrics: { fearGreedIndex: fg.value ?? 50 },
      signal: 'neutral',
      confidence: 0.3,
      reasoning: 'Sentiment analysis could not be completed. Treat as neutral.',
    };
  }
}
