// Order-flow engine — reads WHO is buying/selling, not just price.
//
// CVD (Cumulative Volume Delta): from Binance klines' taker-buy volume we derive
//   buy vs sell aggression. delta = takerBuy - (total - takerBuy) = 2*takerBuy - total.
//   Tells whether a move is real accumulation/distribution or just drift.
// Order-book imbalance: a live snapshot of bid vs ask depth near the mid — where
//   the wall of resting buyers/sellers sits right now.
//
// All free, no API key. The book is live-only; CVD can also be computed historically.

const BINANCE = 'https://api.binance.com/api/v3';
const PAIR_OVERRIDES: Record<string, string> = { MATIC: 'POLUSDT' };
const NO_PAIR = new Set(['USDC', 'USDT', 'DAI']);

function pairFor(symbol: string): string | null {
  const s = symbol.toUpperCase();
  if (NO_PAIR.has(s)) return null;
  return PAIR_OVERRIDES[s] ?? `${s}USDT`;
}

export interface OrderFlow {
  buyVolumePct: number;        // taker-buy share of volume over the window (%)
  cvdTrend: 'accumulation' | 'distribution' | 'balanced';
  netDeltaPct: number;         // net (buy-sell) as % of total volume
  bookImbalance: number;       // bid / (bid+ask) USD within ±1% of mid (0..1)
  bookBias: 'bid-heavy' | 'ask-heavy' | 'balanced';
  spreadPct: number;
  summary: string;
}

type Kline = [number, string, string, string, string, string, number, string, number, string, string, ...unknown[]];

async function bFetch(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(8000) });
}

/** Live order flow for the asset (CVD over last 24h of hourly candles + book snapshot). */
export async function getOrderFlow(symbol: string): Promise<OrderFlow | null> {
  const pair = pairFor(symbol);
  if (!pair) return null;

  try {
    const [klRes, depthRes] = await Promise.all([
      bFetch(`${BINANCE}/klines?symbol=${pair}&interval=1h&limit=24`),
      bFetch(`${BINANCE}/depth?symbol=${pair}&limit=100`),
    ]);
    if (!klRes.ok || !depthRes.ok) return null;

    // ── CVD from taker-buy volume ──
    const kl = (await klRes.json()) as Kline[];
    let totalQuote = 0, takerBuyQuote = 0;
    for (const k of kl) {
      totalQuote += Number(k[7]);       // quote volume
      takerBuyQuote += Number(k[10]);   // taker-buy quote volume
    }
    const buyVolumePct = totalQuote > 0 ? (takerBuyQuote / totalQuote) * 100 : 50;
    const netDeltaPct = totalQuote > 0 ? ((2 * takerBuyQuote - totalQuote) / totalQuote) * 100 : 0;
    const cvdTrend = buyVolumePct >= 55 ? 'accumulation' : buyVolumePct <= 45 ? 'distribution' : 'balanced';

    // ── Order-book imbalance within ±1% of mid ──
    const depth = (await depthRes.json()) as { bids: [string, string][]; asks: [string, string][] };
    const bestBid = Number(depth.bids[0]?.[0] ?? 0);
    const bestAsk = Number(depth.asks[0]?.[0] ?? 0);
    const mid = (bestBid + bestAsk) / 2 || 1;
    const lo = mid * 0.99, hi = mid * 1.01;
    let bidUSD = 0, askUSD = 0;
    for (const [p, q] of depth.bids) { const pr = Number(p); if (pr >= lo) bidUSD += pr * Number(q); }
    for (const [p, q] of depth.asks) { const pr = Number(p); if (pr <= hi) askUSD += pr * Number(q); }
    const bookImbalance = bidUSD + askUSD > 0 ? bidUSD / (bidUSD + askUSD) : 0.5;
    const bookBias = bookImbalance >= 0.58 ? 'bid-heavy' : bookImbalance <= 0.42 ? 'ask-heavy' : 'balanced';
    const spreadPct = mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 0;

    const summary =
      `Last 24h: ${buyVolumePct.toFixed(0)}% taker-buy (${cvdTrend}). ` +
      `Order book ${bookBias} (${(bookImbalance * 100).toFixed(0)}% bid within ±1%). ` +
      `${cvdTrend === 'accumulation' && bookBias === 'bid-heavy' ? 'Flow and resting bids both lean bullish.' : cvdTrend === 'distribution' && bookBias === 'ask-heavy' ? 'Flow and resting offers both lean bearish.' : 'Flow and book are mixed — no strong order-flow conviction.'}`;

    return { buyVolumePct, cvdTrend, netDeltaPct, bookImbalance, bookBias, spreadPct, summary };
  } catch (err) {
    console.log(`[order-flow] failed for ${symbol} (${err})`);
    return null;
  }
}

/** Compact block for the LLM prompt. */
export function summarizeOrderFlow(of: OrderFlow): string {
  return `ORDER FLOW (live, Binance) — who's actually trading:\n• ${of.summary}`;
}
