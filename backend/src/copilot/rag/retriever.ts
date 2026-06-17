// Temporal, metadata-filtered retrieval over the news corpus.
// Filters by symbol and (optionally) a publishedAt time window so the chat can
// answer "what drove this candle?" with news from that exact period.
import { embedQuery, isEmbeddingsConfigured } from './embeddings.js';
import { queryVectors, isVectorStoreConfigured, type NewsMetadata } from './vector-store.js';

export interface RetrievedDoc {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: string;
  score: number;
}

export interface RetrieveOpts {
  symbol: string;
  fromTs?: number; // unix ms — lower bound on publishedAt
  toTs?: number;   // unix ms — upper bound on publishedAt
  topK?: number;
}

export function isRagAvailable(): boolean {
  return isEmbeddingsConfigured() && isVectorStoreConfigured();
}

export async function retrieveNews(query: string, opts: RetrieveOpts): Promise<RetrievedDoc[]> {
  if (!isRagAvailable()) return [];

  const filter: Record<string, unknown> = { symbol: { $eq: opts.symbol.toUpperCase() } };
  const range: Record<string, number> = {};
  if (opts.fromTs) range.$gte = opts.fromTs;
  if (opts.toTs) range.$lte = opts.toTs;
  if (Object.keys(range).length) filter.publishedAt = range;

  try {
    const vector = await embedQuery(query);
    const hits = await queryVectors(vector, { topK: opts.topK ?? 6, filter });
    return hits.map((h) => {
      const m = h.metadata as NewsMetadata;
      return {
        title: m.title,
        url: m.url,
        source: m.source,
        publishedAt: m.publishedAt,
        sentiment: m.sentiment,
        score: h.score,
      };
    });
  } catch (err) {
    console.error('[rag][retriever] query failed:', err);
    return [];
  }
}
