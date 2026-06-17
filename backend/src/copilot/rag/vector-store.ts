// Pinecone serverless vector store for the news/events RAG corpus.
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import { EMBED_DIM } from './embeddings.js';
dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const INDEX_NAME = process.env.PINECONE_INDEX ?? 'signal-news';
const CLOUD = (process.env.PINECONE_CLOUD ?? 'aws') as 'aws' | 'gcp' | 'azure';
const REGION = process.env.PINECONE_REGION ?? 'us-east-1';

export interface NewsMetadata {
  symbol: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number; // unix ms — used for temporal metadata filtering
  sentiment: string;
  [key: string]: string | number; // Pinecone metadata index signature
}

export function isVectorStoreConfigured(): boolean {
  return !!PINECONE_API_KEY;
}

let client: Pinecone | null = null;
function pc(): Pinecone {
  if (!PINECONE_API_KEY) throw new Error('PINECONE_API_KEY not set');
  if (!client) client = new Pinecone({ apiKey: PINECONE_API_KEY });
  return client;
}

/** Create the serverless index if it doesn't already exist (idempotent). */
export async function ensureIndex(): Promise<void> {
  const existing = await pc().listIndexes();
  if (existing.indexes?.some((i) => i.name === INDEX_NAME)) return;

  console.log(`[rag] creating Pinecone index "${INDEX_NAME}" (dim=${EMBED_DIM}, cosine)`);
  await pc().createIndex({
    name: INDEX_NAME,
    dimension: EMBED_DIM,
    metric: 'cosine',
    spec: { serverless: { cloud: CLOUD, region: REGION } },
    waitUntilReady: true,
  });
}

function index() {
  return pc().index<NewsMetadata>(INDEX_NAME);
}

export interface UpsertItem {
  id: string;
  values: number[];
  metadata: NewsMetadata;
}

export async function upsertVectors(items: UpsertItem[]): Promise<void> {
  if (items.length === 0) return;
  // Pinecone recommends batches <= 100 vectors.
  for (let i = 0; i < items.length; i += 100) {
    await index().upsert({ records: items.slice(i, i + 100) });
  }
}

export interface QueryHit {
  id: string;
  score: number;
  metadata: NewsMetadata;
}

export async function queryVectors(
  vector: number[],
  opts: { topK: number; filter?: Record<string, unknown> }
): Promise<QueryHit[]> {
  const res = await index().query({
    vector,
    topK: opts.topK,
    includeMetadata: true,
    filter: opts.filter,
  });
  return (res.matches ?? []).map((m) => ({
    id: m.id,
    score: m.score ?? 0,
    metadata: m.metadata as NewsMetadata,
  }));
}
