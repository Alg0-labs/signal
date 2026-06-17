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

export async function analyzeMarket(trade: TradeIntent, marketData: any): Promise<AnalystReport> {
  const symbol = trade.symbol.toUpperCase();
  const timestamp = new Date().toISOString();

  const ohlcv = marketData?.ohlcv ?? [];
  const market = marketData?.market ?? {};

  const closes = ohlcv.slice(-14).map((c: any) => c.close).join(', ');
  const latestClose = ohlcv.length > 0 ? ohlcv[ohlcv.length - 1].close : market.price ?? 0;

  // CMC context from shared memory (may be empty if MCP server not running)
  const cmcSection = marketData?.cmcContext
    ? `\nCOINMARKETCAP INTELLIGENCE:\n${marketData.cmcContext}\n`
    : ''

  const prompt = `You are a quantitative market analyst. Analyze the technical data for ${symbol} and assess whether it's a good time to ${trade.action}.

TECHNICAL DATA:
- Current Price: $${latestClose.toFixed(2)}
- 24h Change: ${market.change24h?.toFixed(2) ?? 'N/A'}%
- 7d Change: ${market.priceChange7d?.toFixed(2) ?? 'N/A'}%
- Volume 24h: $${(market.volume24h / 1e6)?.toFixed(1) ?? 'N/A'}M
- Market Cap: $${(market.marketCap / 1e9)?.toFixed(2) ?? 'N/A'}B
- ATH: $${market.ath?.toFixed(2) ?? 'N/A'}
- Recent Closes (last 14 periods): ${closes || 'N/A'}
- RSI(14): ${marketData?.rsi?.toFixed(1) ?? 'N/A'}
- MACD: value=${marketData?.macd?.value?.toFixed(4) ?? 'N/A'}, signal=${marketData?.macd?.signal?.toFixed(4) ?? 'N/A'}, histogram=${marketData?.macd?.histogram?.toFixed(4) ?? 'N/A'}
${cmcSection}
Provide a concise technical analysis. Focus on:
1. RSI position and what it implies
2. MACD crossovers and momentum direction
3. Price trend (24h, 7d) + CMC ranking if available
4. Volume analysis and what it signals
5. Key support/resistance zones based on price history

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
2-3 sentence overall reasoning for your ${trade.action} signal.
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
      analyst: 'market',
      timestamp,
      asset: symbol,
      keyFindings,
      metrics: {
        price: latestClose,
        change24h: market.change24h ?? 0,
        rsi: marketData?.rsi ?? 50,
        macdHistogram: marketData?.macd?.histogram ?? 0,
      },
      signal,
      confidence,
      reasoning,
    };
  } catch (err) {
    console.error(`[copilot][market-analyst] Error for ${symbol}:`, err);
    return {
      analyst: 'market',
      timestamp,
      asset: symbol,
      keyFindings: ['Technical analysis unavailable due to API error'],
      metrics: { price: latestClose, change24h: market.change24h ?? 0 },
      signal: 'neutral',
      confidence: 0.3,
      reasoning: 'Analysis could not be completed. Treat as neutral.',
    };
  }
}
