// News ingestion: fetch RSS per symbol -> embed -> upsert into Pinecone.
// Each vector carries {symbol, publishedAt, ...} metadata so retrieval can be
// filtered by ticker AND time window (the "what happened on this candle" query).
//
// Run manually:   npm run rag:ingest
// Or on a timer:  scheduleIngest() from index.ts
import { createHash } from 'node:crypto';
import { fetchNewsForSymbol, type RssNewsItem } from '../tools/news-rss.js';
import { embed, isEmbeddingsConfigured } from './embeddings.js';
import {
  ensureIndex,
  upsertVectors,
  isVectorStoreConfigured,
  type UpsertItem,
} from './vector-store.js';

// Symbols we keep a fresh news corpus for (matches supported chart assets + majors).
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'AVAX', 'MATIC'];

function docId(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}

function docText(a: RssNewsItem): string {
  return a.summary ? `${a.title}. ${a.summary}` : a.title;
}

export async function runIngest(symbols: string[] = SYMBOLS): Promise<{ ingested: number }> {
  if (!isEmbeddingsConfigured() || !isVectorStoreConfigured()) {
    console.log('[rag][ingest] skipped — VOYAGE_API_KEY or PINECONE_API_KEY not set');
    return { ingested: 0 };
  }

  await ensureIndex();

  // Collect all articles across symbols first, then embed in ONE batched request.
  // Voyage's no-card free tier is 3 RPM, so minimizing request count matters.
  const docs: Array<{ symbol: string; a: RssNewsItem }> = [];
  for (const symbol of symbols) {
    try {
      const articles = await fetchNewsForSymbol(symbol);
      for (const a of articles) docs.push({ symbol, a });
    } catch (err) {
      console.error(`[rag][ingest] fetch ${symbol} failed:`, err);
    }
  }
  if (docs.length === 0) {
    console.log('[rag][ingest] no articles fetched');
    return { ingested: 0 };
  }

  // Embed in chunks (Voyage accepts up to 1000 inputs / 120K tokens per request).
  let total = 0;
  for (let i = 0; i < docs.length; i += 120) {
    const chunk = docs.slice(i, i + 120);
    const vectors = await embed(chunk.map((d) => docText(d.a)), 'document');
    const items: UpsertItem[] = chunk.map((d, j) => ({
      id: docId(d.a.url),
      values: vectors[j],
      metadata: {
        symbol: d.symbol,
        title: d.a.title,
        url: d.a.url,
        source: d.a.source,
        publishedAt: d.a.publishedAt,
        sentiment: d.a.sentiment,
      },
    }));
    await upsertVectors(items);
    total += items.length;
  }

  console.log(`[rag][ingest] done — ${total} vectors upserted across ${symbols.length} symbols`);
  return { ingested: total };
}

/** Periodic ingestion (default every 3h — conserves embedding quota). No-op if RAG unconfigured. */
export function scheduleIngest(intervalMs = 3 * 60 * 60 * 1000): void {
  if (!isEmbeddingsConfigured() || !isVectorStoreConfigured()) return;
  // Delay the first run so it doesn't consume the rate limiter right when a user
  // might ask their first question after a restart.
  setTimeout(() => runIngest().catch((e) => console.error('[rag][ingest] initial run failed:', e)), 90_000);
  setInterval(() => runIngest().catch((e) => console.error('[rag][ingest] run failed:', e)), intervalMs);
}

// Allow `tsx src/copilot/rag/ingest.ts` / npm script to run a one-off ingest.
if (import.meta.url === `file://${process.argv[1]}`) {
  runIngest().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
