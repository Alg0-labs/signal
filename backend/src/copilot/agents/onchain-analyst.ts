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

export async function analyzeOnchain(trade: TradeIntent, onchainData: any): Promise<AnalystReport> {
  const symbol = trade.symbol.toUpperCase();
  const timestamp = new Date().toISOString();

  const whales = onchainData?.whales ?? {};
  const market = onchainData?.market ?? {};

  const prompt = `You are an on-chain and market microstructure analyst. Analyze volume anomalies and whale activity for ${symbol} to assess a potential ${trade.action} trade.

ON-CHAIN PROXY DATA (via exchange volume):
- Volume Anomaly: ${whales.volumeAnomaly?.toFixed(2) ?? '1.00'}x the 7-day average
- Whale Direction Signal: ${whales.direction ?? 'neutral'} (accumulation/distribution/neutral)
- Net Flow Signal: ${whales.netFlow ?? 'neutral'} (inflow/outflow/neutral)
- Large Volume Alert Triggered: ${whales.alert ? 'YES' : 'No'}
- Current Price: $${market.price?.toFixed(2) ?? 'N/A'}
- 24h Price Change: ${market.change24h?.toFixed(2) ?? '0'}%
- 24h Volume: $${((market.volume24h ?? 0) / 1e6).toFixed(1)}M
- Market Cap: $${((market.marketCap ?? 0) / 1e9).toFixed(2)}B

Note: Volume data is from centralized exchanges as proxy for on-chain flows.

Analyze:
1. Whether volume anomaly indicates institutional/whale activity
2. Accumulation vs distribution signals based on price/volume relationship
3. Net capital flow direction and what it means for price
4. Whether smart money is moving with or against the proposed ${trade.action}
5. Risk of a large sell-off or short squeeze based on volume patterns

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
2-3 sentence reasoning for your on-chain/volume ${trade.action} signal.
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
      analyst: 'onchain',
      timestamp,
      asset: symbol,
      keyFindings,
      metrics: {
        volumeAnomaly: whales.volumeAnomaly ?? 1,
        whaleDirection: whales.direction ?? 'neutral',
        netFlow: whales.netFlow ?? 'neutral',
        alertTriggered: whales.alert ? 1 : 0,
      },
      signal,
      confidence,
      reasoning,
    };
  } catch (err) {
    console.error(`[copilot][onchain-analyst] Error for ${symbol}:`, err);
    return {
      analyst: 'onchain',
      timestamp,
      asset: symbol,
      keyFindings: ['On-chain analysis unavailable due to API error'],
      metrics: {},
      signal: 'neutral',
      confidence: 0.3,
      reasoning: 'On-chain analysis could not be completed. Treat as neutral.',
    };
  }
}
