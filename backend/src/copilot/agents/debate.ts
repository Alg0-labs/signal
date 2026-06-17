import Anthropic from '@anthropic-ai/sdk';
import type { TradeIntent, AnalystReport, DebateMessage } from '../types.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseKeyPoints(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 5);
}

function buildReportSummary(reports: AnalystReport[]): string {
  return reports
    .map(
      (r) =>
        `${r.analyst.toUpperCase()} ANALYST: Signal=${r.signal}, Confidence=${r.confidence.toFixed(2)}\n  Reasoning: ${r.reasoning}\n  Key: ${r.keyFindings[0] ?? 'N/A'}`
    )
    .join('\n\n');
}

export async function runDebate(
  analystReports: AnalystReport[],
  trade: TradeIntent,
  rounds: number = 2
): Promise<DebateMessage[]> {
  const symbol = trade.symbol.toUpperCase();
  const action = trade.action;
  const reportSummary = buildReportSummary(analystReports);
  const messages: DebateMessage[] = [];

  console.log(`[copilot][debate] Starting ${rounds}-round debate for ${symbol} ${action}`);

  try {
    // Round 1: Bull opens
    const bullRound1Prompt = `You are the BULL analyst in a trading debate. Make the strongest possible case FOR executing this ${action} trade on ${symbol}.

ANALYST REPORTS:
${reportSummary}

TRADE: ${action} ${symbol}

Give 3-5 concise bullet points arguing FOR this trade. Be direct and data-driven. Focus on opportunity, not risk.
Respond with just the bullet points, one per line, starting with "-".`;

    const bullR1 = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: bullRound1Prompt }],
    });
    const bullR1Text = bullR1.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
    messages.push({
      speaker: 'bull',
      round: 1,
      argument: bullR1Text.trim(),
      keyPoints: parseKeyPoints(bullR1Text),
    });

    // Round 1: Bear responds
    const bearRound1Prompt = `You are the BEAR analyst in a trading debate. Make the strongest possible case AGAINST executing this ${action} trade on ${symbol}.

ANALYST REPORTS:
${reportSummary}

BULL'S ARGUMENT:
${bullR1Text.trim()}

TRADE: ${action} ${symbol}

Give 3-5 concise bullet points arguing AGAINST this trade. Be direct and data-driven. Focus on risk and downside.
Respond with just the bullet points, one per line, starting with "-".`;

    const bearR1 = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: bearRound1Prompt }],
    });
    const bearR1Text = bearR1.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
    messages.push({
      speaker: 'bear',
      round: 1,
      argument: bearR1Text.trim(),
      keyPoints: parseKeyPoints(bearR1Text),
    });

    if (rounds >= 2) {
      // Round 2: Bull rebuts bear's strongest points
      const bullRound2Prompt = `You are the BULL analyst. Rebut the bear's strongest arguments for the ${action} ${symbol} trade.

BEAR'S ARGUMENTS:
${bearR1Text.trim()}

Give 3-4 concise rebuttals, each addressing one of bear's points. Be direct.
Respond with just the bullet points, one per line, starting with "-".`;

      const bullR2 = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: bullRound2Prompt }],
      });
      const bullR2Text = bullR2.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
      messages.push({
        speaker: 'bull',
        round: 2,
        argument: bullR2Text.trim(),
        keyPoints: parseKeyPoints(bullR2Text),
      });

      // Round 2: Bear rebuttal
      const bearRound2Prompt = `You are the BEAR analyst. Rebut the bull's strongest arguments for the ${action} ${symbol} trade.

BULL'S REBUTTALS:
${bullR2Text.trim()}

Give 3-4 concise counter-rebuttals. Be direct.
Respond with just the bullet points, one per line, starting with "-".`;

      const bearR2 = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: bearRound2Prompt }],
      });
      const bearR2Text = bearR2.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
      messages.push({
        speaker: 'bear',
        round: 2,
        argument: bearR2Text.trim(),
        keyPoints: parseKeyPoints(bearR2Text),
      });
    }

    // Facilitator synthesis
    const allArguments = messages.map((m) => `${m.speaker.toUpperCase()} (Round ${m.round}): ${m.argument}`).join('\n\n');
    const facilitatorPrompt = `You are a neutral trading facilitator. Synthesize this debate about ${action} ${symbol} into a final verdict.

DEBATE SUMMARY:
${allArguments}

Analyst consensus: ${analystReports.filter((r) => r.signal === 'bullish').length} bullish, ${analystReports.filter((r) => r.signal === 'bearish').length} bearish, ${analystReports.filter((r) => r.signal === 'neutral').length} neutral

Provide a 3-4 sentence synthesis covering:
1. Which side made stronger arguments
2. Key risk/opportunity balance
3. Final recommendation with conditions

Be concise and decisive.`;

    const facilitator = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: facilitatorPrompt }],
    });
    const facilitatorText = facilitator.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
    messages.push({
      speaker: 'facilitator',
      round: rounds,
      argument: facilitatorText.trim(),
      keyPoints: parseKeyPoints(facilitatorText),
    });

    console.log(`[copilot][debate] Completed debate for ${symbol}: ${messages.length} messages`);
    return messages;
  } catch (err) {
    console.error(`[copilot][debate] Error for ${symbol}:`, err);
    return [
      {
        speaker: 'facilitator',
        round: 1,
        argument: 'Debate could not be completed due to an API error. Proceed with caution and rely on analyst reports.',
        keyPoints: ['API error during debate', 'Rely on analyst reports for decision'],
      },
    ];
  }
}
