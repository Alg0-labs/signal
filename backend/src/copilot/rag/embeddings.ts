// Text embeddings for the RAG layer.
//
// PRIMARY: Google Gemini (`gemini-embedding-001`, 768-dim) — free tier with
// generous rate limits, so no client-side throttling needed. Uses asymmetric
// task types (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY) for better retrieval.
// FALLBACK: Voyage AI (`voyage-3.5-lite`) — only used if GEMINI_API_KEY is unset
// (its no-card free tier is 3 RPM, so that path is rate-limited + spaced).
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

type Provider = 'gemini' | 'voyage' | 'none';
const PROVIDER: Provider = GEMINI_API_KEY ? 'gemini' : VOYAGE_API_KEY ? 'voyage' : 'none';

// Index dimension follows the active provider. (Gemini 768 / Voyage 1024.)
export const EMBED_DIM = PROVIDER === 'voyage' ? 1024 : 768;

const GEMINI_MODEL = 'gemini-embedding-001';
const VOYAGE_MODEL = 'voyage-3.5-lite';

export function isEmbeddingsConfigured(): boolean {
  return PROVIDER !== 'none';
}
export function embeddingsProvider(): Provider {
  return PROVIDER;
}

function l2normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

// ── Voyage-only rate limiter (Gemini free tier is generous → no spacing) ──────
const MIN_INTERVAL_MS = PROVIDER === 'voyage' ? Number(process.env.VOYAGE_MIN_INTERVAL_MS ?? 21000) : 0;
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  if (MIN_INTERVAL_MS <= 0) return fn();
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCallAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.then(() => {}, () => {});
  return run;
}

// Cache query embeddings so repeated questions don't re-hit the API.
const queryCache = new Map<string, number[]>();
const QUERY_CACHE_MAX = 500;

// ── Gemini ────────────────────────────────────────────────────────────────
async function geminiEmbed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  const taskType = inputType === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY';
  const out: number[][] = [];
  // Smaller batches keep us under per-request quota; one query stays 1 request.
  for (let i = 0; i < texts.length; i += 25) {
    const chunk = texts.slice(i, i + 25);
    let json: { embeddings?: Array<{ values: number[] }> } | null = null;
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: chunk.map((t) => ({
              model: `models/${GEMINI_MODEL}`,
              content: { parts: [{ text: t }] },
              taskType,
              outputDimensionality: EMBED_DIM,
            })),
          }),
          signal: AbortSignal.timeout(20000),
        }
      );
      if (res.status === 429 && attempt < maxAttempts) {
        const wait = 5000 * attempt;
        console.log(`[rag][gemini] 429 quota — retrying in ${wait / 1000}s (${attempt}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Gemini embeddings ${res.status}: ${(await res.text()).slice(0, 160)}`);
      json = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
      break;
    }
    if (!json?.embeddings) throw new Error('Gemini: malformed response');
    // Sub-3072 dims are not auto-normalized — normalize for stable cosine scores.
    for (const e of json.embeddings) out.push(l2normalize(e.values));
  }
  return out;
}

// ── Voyage ──────────────────────────────────────────────────────────────────
async function voyageEmbed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType, output_dimension: EMBED_DIM }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429 && attempt < maxAttempts) {
      const wait = 21000 * attempt;
      console.log(`[rag][voyage] 429 — retrying in ${wait / 1000}s (${attempt}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Voyage embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    if (!json.data) throw new Error('Voyage: malformed response');
    return json.data.map((d) => d.embedding);
  }
  throw new Error('Voyage embeddings: exhausted retries');
}

/**
 * Embed a batch of texts.
 * @param inputType 'document' when storing, 'query' when searching (asymmetric).
 */
export async function embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  if (PROVIDER === 'none') throw new Error('No embeddings provider configured (set GEMINI_API_KEY or VOYAGE_API_KEY)');
  if (texts.length === 0) return [];
  const run = PROVIDER === 'gemini' ? () => geminiEmbed(texts, inputType) : () => voyageEmbed(texts, inputType);
  return schedule(run);
}

/** Convenience: embed a single query string (cached). */
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();
  const cached = queryCache.get(key);
  if (cached) return cached;
  const [v] = await embed([text], 'query');
  if (queryCache.size >= QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value as string);
  queryCache.set(key, v);
  return v;
}
