// "Talk to the chart" — an agentic assistant grounded in live market data
// (Binance OHLCV + indicators, injected up front) plus temporal RAG over news
// (the `search_news` tool → Pinecone/Voyage), returning cited explanations.
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import dotenv from 'dotenv';
import { getMarketData, getOHLCVV } from '../copilot/tools/market-data.js';
import { analyzeTechnicals, summarizeTechnicals, type TechnicalAnalysis } from '../copilot/tools/technical-analysis.js';
import { findAnalogs, findAnalogsForWindow, summarizeAnalogs, type AnalogResult } from '../copilot/tools/historical-analogs.js';
import { detectPattern, type PatternResult } from '../copilot/tools/chart-patterns.js';
import { getOrderFlow, summarizeOrderFlow, type OrderFlow } from '../copilot/tools/order-flow.js';
import { retrieveNews, isRagAvailable, type RetrievedDoc } from '../copilot/rag/retriever.js';
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ChartChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Citation {
  index: number;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: string;
}

export interface ChartChatResult {
  reply: string;
  citations: Citation[];
  ragAvailable: boolean;
  technicals: TechnicalAnalysis | null; // structured facts for the fixed UI card
  analogs: AnalogResult | null;
  pattern: PatternResult | null;
  orderFlow: OrderFlow | null;
  asOf: number;
}

const SEARCH_NEWS_TOOL: Tool = {
  name: 'search_news',
  description:
    'Search recent crypto news for the asset being discussed, to explain WHY price moved. ' +
    'Returns time-stamped, citable articles. Use it whenever the user asks about causes, ' +
    'catalysts, or "what happened". Prefer narrowing by the time window in question.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for, e.g. "ETH selloff ETF outflows"' },
      from_iso: { type: 'string', description: 'Optional ISO date lower bound (article must be newer).' },
      to_iso: { type: 'string', description: 'Optional ISO date upper bound (article must be older).' },
    },
    required: ['query'],
  },
};

const DAY = 86_400_000;

interface GatheredContext {
  prompt: string;
  technicals: TechnicalAnalysis | null;
  analogs: AnalogResult | null;
  pattern: PatternResult | null;
  orderFlow: OrderFlow | null;
  asOf: number;
}

async function gather(
  symbol: string,
  range?: { from?: number; to?: number },
  selection?: { from: number; to: number }
): Promise<GatheredContext> {
  const isBTC = symbol.toUpperCase() === 'BTC';
  // If a candle weeks+ in the past was clicked, analyse "as of" that date so both
  // engines reflect that moment — not today. Recent clicks → current state.
  const clickedOld = !!(range?.to && range.to < Date.now() - 7 * DAY);
  const oldSelection = !!(selection && selection.to < Date.now() - 7 * DAY);
  const isHistorical = clickedOld || oldSelection;
  const endMs = clickedOld ? range!.to : undefined;

  // 730 daily candles → 2 years of analog history (MA200 + level detection too).
  // Order flow is live-only, so only fetch it when looking at the current state.
  const [market, candles, btc, orderFlow] = await Promise.all([
    getMarketData(symbol),
    getOHLCVV(symbol, 730, endMs),
    isBTC ? Promise.resolve([]) : getOHLCVV('BTC', 730, endMs),
    isHistorical ? Promise.resolve(null) : getOrderFlow(symbol),
  ]);

  const closes = candles.map((c) => c.close);
  const technicals = analyzeTechnicals(candles, btc.map((c) => c.close), isBTC);

  // Range-select: analyse the marked span as the pattern; else the recent 30-day shape.
  const selCandles = selection
    ? candles.filter((c) => c.time >= selection.from && c.time <= selection.to)
    : candles.slice(-30);
  const analogs = selection
    ? findAnalogsForWindow(candles, selection.from, selection.to)
    : findAnalogs(candles);
  const pattern = detectPattern(selCandles);
  const asOf = candles.length ? candles[candles.length - 1].time : Date.now();

  // Price/stats: live ticker for "now", or reconstructed from candles for a past date.
  let priceLine: string;
  if (clickedOld && closes.length >= 8) {
    const last = closes[closes.length - 1];
    const c24 = ((last - closes[closes.length - 2]) / closes[closes.length - 2]) * 100;
    const c7 = ((last - closes[closes.length - 8]) / closes[closes.length - 8]) * 100;
    priceLine = `Close as of ${new Date(asOf).toISOString().slice(0, 10)}: $${last} | 1d: ${c24.toFixed(2)}% | 7d: ${c7.toFixed(2)}%`;
  } else {
    priceLine = market
      ? `Price: $${market.price} | 24h: ${market.change24h.toFixed(2)}% | 7d: ${market.priceChange7d.toFixed(2)}% | 24h vol: $${Math.round(market.volume24h).toLocaleString()}`
      : 'Price: unavailable';
  }

  const tail = candles.slice(-8).map((c) => {
    const d = new Date(c.time).toISOString().slice(0, 10);
    return `${d}: O ${c.open} H ${c.high} L ${c.low} C ${c.close} V $${Math.round(c.volume).toLocaleString()}`;
  });

  const selLabel = selection
    ? `SELECTED RANGE: ${new Date(selection.from).toISOString().slice(0, 10)} → ${new Date(selection.to).toISOString().slice(0, 10)} (${selCandles.length} candles) — analyse THIS span's pattern.`
    : '';
  const patternLine = pattern
    ? `PATTERN (rule-based, ${pattern.confidence} confidence): ${pattern.name} [${pattern.bias}] — ${pattern.description}`
    : '';

  const prompt = [
    `Asset: ${symbol}/USD`,
    priceLine,
    selLabel,
    !clickedOld && market?.marketCap ? `Market cap: $${Math.round(market.marketCap).toLocaleString()} | ATH: $${market.ath}` : '',
    technicals ? summarizeTechnicals(technicals, symbol) : '',
    patternLine,
    orderFlow ? summarizeOrderFlow(orderFlow) : '',
    analogs ? summarizeAnalogs(analogs) : '',
    clickedOld ? 'Candles leading into the selected date:' : 'Recent daily candles:',
    ...tail,
  ].filter(Boolean).join('\n');

  return { prompt, technicals, analogs, pattern, orderFlow, asOf };
}

export async function chartChat(params: {
  symbol: string;
  range?: { from?: number; to?: number };
  selection?: { from: number; to: number };
  messages: ChartChatMessage[];
}): Promise<ChartChatResult> {
  const { symbol, range, selection, messages } = params;
  const ragAvailable = isRagAvailable();

  const { prompt: snapshot, technicals, analogs, pattern, orderFlow, asOf } = await gather(symbol, range, selection);

  const system = [
    `You are a professional crypto technical analyst writing a concise desk note next to a live`,
    `${symbol} chart. The LIVE DATA below contains a computed TECHNICAL READ and HISTORICAL ANALOGS —`,
    `treat them as ground truth; never recompute or contradict them.`,
    ``,
    `A metrics card with the raw numbers is ALREADY shown to the user above your text. So do NOT`,
    `restate tables of numbers or list every level — interpret them. Reference a figure only when it`,
    `carries the point (e.g. "rejected at the $1,907 resistance"). Quality over length.`,
    ``,
    `Structure the note with these exact markdown headers, in order (no emojis, no decorative symbols):`,
    `### Read — 2-3 sentences on the trend, location vs key levels/MAs, and momentum.`,
    `### Key factors — 3-4 short bullets of the most decision-relevant points.`,
    `### Catalyst — the news driver, grounded in cited articles [n] (call search_news first). If none indexed, say so plainly in one line.`,
    `### Historical precedent — what the analog stats imply (this is an empirical backtest of similar past setups, not a forecast).`,
    `### Verdict — one probabilistic line: bias + conviction, then a one-line risk caveat.`,
    ``,
    `If a PATTERN and/or SELECTED RANGE is provided, open the Read with the pattern name + bias and`,
    `its confidence, and make Historical precedent about how that pattern/shape resolved in the past`,
    `(use the analog stats). Respect the rule-based confidence — don't over-claim a low-confidence pattern.`,
    `If ORDER FLOW is present, weave it into Key factors — does buy/sell pressure and the order book`,
    `confirm or contradict the price read? (e.g. "rally on distribution = suspect"). It's live only.`,
    ``,
    `Tone: measured, institutional, plain. No hype, no emojis in the body, no "as an AI". Be`,
    `probabilistic, never certain. Never invent prices/levels/dates/news. End with: "Not financial advice."`,
    ``,
    `LIVE DATA`,
    snapshot,
  ].join('\n');

  const apiMessages: MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  const citations: Citation[] = [];
  const seen = new Map<string, number>(); // url -> citation index
  function registerDocs(docs: RetrievedDoc[]): Array<Citation & { score: number }> {
    return docs.map((d) => {
      let idx = seen.get(d.url);
      if (idx === undefined) {
        idx = citations.length + 1;
        seen.set(d.url, idx);
        citations.push({ index: idx, title: d.title, url: d.url, source: d.source, publishedAt: d.publishedAt, sentiment: d.sentiment });
      }
      return { index: idx, title: d.title, url: d.url, source: d.source, publishedAt: d.publishedAt, sentiment: d.sentiment, score: d.score };
    });
  }

  const tools = ragAvailable ? [SEARCH_NEWS_TOOL] : [];
  const maxRounds = 4;

  for (let round = 0; round < maxRounds; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: apiMessages,
      tools,
    });

    if (response.stop_reason !== 'tool_use') {
      const reply = (response.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
      return { reply, citations, ragAvailable, technicals, analogs, pattern, orderFlow, asOf };
    }

    apiMessages.push({ role: 'assistant', content: response.content as MessageParam['content'] });

    const toolUses = (response.content as Array<{ type: string; id?: string; name?: string; input?: any }>)
      .filter((b) => b.type === 'tool_use');

    const results: ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === 'search_news') {
        const q = String(tu.input?.query ?? `${symbol} price news`);
        const fromTs = tu.input?.from_iso ? Date.parse(tu.input.from_iso) : range?.from;
        const toTs = tu.input?.to_iso ? Date.parse(tu.input.to_iso) : range?.to;
        const docs = await retrieveNews(q, { symbol, fromTs: isNaN(fromTs!) ? undefined : fromTs, toTs: isNaN(toTs!) ? undefined : toTs, topK: 6 });
        const registered = registerDocs(docs);
        const payload = registered.length
          ? registered.map((d) => `[${d.index}] (${new Date(d.publishedAt).toISOString().slice(0, 10)}, ${d.source}, ${d.sentiment}) ${d.title}`).join('\n')
          : 'No matching news found in the indexed corpus for that query/time window.';
        results.push({ type: 'tool_result', tool_use_id: tu.id!, content: payload });
      } else {
        results.push({ type: 'tool_result', tool_use_id: tu.id!, content: 'Unknown tool', is_error: true });
      }
    }
    apiMessages.push({ role: 'user', content: results });
  }

  // Exhausted rounds — return whatever text we can salvage.
  return { reply: 'I gathered the data but could not finalize an answer — please retry.', citations, ragAvailable, technicals, analogs, pattern, orderFlow, asOf };
}
