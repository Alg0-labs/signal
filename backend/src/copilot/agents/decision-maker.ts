import Anthropic from '@anthropic-ai/sdk';
import type { TradeIntent, AnalystReport, DebateMessage, QuickCheckResult, TradingDecision } from '../types.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseAction(text: string, tradeAction: 'BUY' | 'SELL'): TradingDecision['action'] {
  const match = text.match(/<action>(BUY|SELL|HOLD)<\/action>/i);
  if (match) return match[1].toUpperCase() as TradingDecision['action'];
  // Fall back to the requested action or HOLD
  if (text.toUpperCase().includes('HOLD')) return 'HOLD';
  return tradeAction;
}

function parseConviction(text: string): TradingDecision['conviction'] {
  const match = text.match(/<conviction>(strong|moderate|weak)<\/conviction>/i);
  if (match) return match[1].toLowerCase() as TradingDecision['conviction'];
  if (text.toLowerCase().includes('strong')) return 'strong';
  if (text.toLowerCase().includes('weak')) return 'weak';
  return 'moderate';
}

function parseConfidence(text: string): number {
  const match = text.match(/<confidence>([\d.]+)<\/confidence>/);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return Math.min(1, Math.max(0, val));
  }
  return 0.5;
}

function parsePositionSize(text: string): number {
  const match = text.match(/<position_size>([\d.]+)<\/position_size>/);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return Math.min(50, Math.max(0, val));
  }
  return 10;
}

function parseEntryMethod(text: string): TradingDecision['entryMethod'] {
  const match = text.match(/<entry_method>(market|limit|dca)<\/entry_method>/i);
  if (match) return match[1].toLowerCase() as TradingDecision['entryMethod'];
  if (text.toLowerCase().includes('dca')) return 'dca';
  if (text.toLowerCase().includes('limit')) return 'limit';
  return 'market';
}

function parseReasoning(text: string): string {
  const match = text.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
  if (match) return match[1].trim().slice(0, 600);
  return text.slice(0, 300);
}

export async function makeDecision(
  trade: TradeIntent,
  analystReports: AnalystReport[],
  debate: DebateMessage[],
  quickCheck: QuickCheckResult
): Promise<TradingDecision> {
  const symbol = trade.symbol.toUpperCase();
  const action = trade.action;

  // Summarize analyst consensus
  const bullishCount = analystReports.filter((r) => r.signal === 'bullish').length;
  const bearishCount = analystReports.filter((r) => r.signal === 'bearish').length;
  const neutralCount = analystReports.filter((r) => r.signal === 'neutral').length;
  const avgAnalystConfidence = analystReports.reduce((s, r) => s + r.confidence, 0) / Math.max(analystReports.length, 1);

  const analystSummary = analystReports
    .map((r) => `- ${r.analyst.toUpperCase()}: ${r.signal} (${(r.confidence * 100).toFixed(0)}% confidence) — ${r.reasoning.slice(0, 150)}`)
    .join('\n');

  const facilitatorMessage = debate.find((m) => m.speaker === 'facilitator');
  const debateSummary = facilitatorMessage?.argument ?? 'No debate available.';

  const prompt = `You are the Chief Trading Officer making a final decision on a ${action} trade for ${symbol}.

ANALYST CONSENSUS:
${analystSummary}
Consensus: ${bullishCount} bullish, ${bearishCount} bearish, ${neutralCount} neutral
Avg Confidence: ${(avgAnalystConfidence * 100).toFixed(0)}%

DEBATE FACILITATOR VERDICT:
${debateSummary}

QUICK CHECK RESULT:
- Severity: ${quickCheck.severity}
- Recommendation: ${quickCheck.recommendation}
- Overall Confidence: ${(quickCheck.confidence * 100).toFixed(0)}%

TRADE REQUEST: ${action} ${symbol}
${trade.portfolioContext ? `Portfolio Risk Tolerance: ${trade.portfolioContext.riskTolerance}` : ''}

Make a final trading decision. Weigh all evidence. Choose an action that maximizes risk-adjusted returns.

Respond ONLY in this exact format:
<action>BUY|SELL|HOLD</action>
<conviction>strong|moderate|weak</conviction>
<confidence>0.0-1.0</confidence>
<position_size>percentage 1-30</position_size>
<entry_method>market|limit|dca</entry_method>
<reasoning>
2-3 sentences explaining the final decision and key factors that drove it.
</reasoning>`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const decision: TradingDecision = {
      action: parseAction(text, action),
      conviction: parseConviction(text),
      confidence: parseConfidence(text),
      reasoning: parseReasoning(text),
      positionSizePct: parsePositionSize(text),
      entryMethod: parseEntryMethod(text),
    };

    console.log(
      `[copilot][decision] ${symbol}: ${decision.action} (${decision.conviction}, ${(decision.confidence * 100).toFixed(0)}% confident, ${decision.positionSizePct}% position)`
    );

    return decision;
  } catch (err) {
    console.error(`[copilot][decision] Error for ${symbol}:`, err);
    // Safe fallback
    return {
      action: 'HOLD',
      conviction: 'weak',
      confidence: 0.3,
      reasoning: 'Decision could not be completed due to an API error. Defaulting to HOLD for safety.',
      positionSizePct: 0,
      entryMethod: 'market',
    };
  }
}
