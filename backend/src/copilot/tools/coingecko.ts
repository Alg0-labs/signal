import dotenv from 'dotenv';
dotenv.config();

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  ARB: 'arbitrum',
  OP: 'optimism',
  INJ: 'injective-protocol',
  SUI: 'sui',
  APT: 'aptos',
  DOT: 'polkadot',
  ADA: 'cardano',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  ATOM: 'cosmos',
  FTM: 'fantom',
  NEAR: 'near',
  ALGO: 'algorand',
  VET: 'vechain',
  ICP: 'internet-computer',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
};

const BASE_URL = 'https://api.coingecko.com/api/v3';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Oracle-Copilot/1.0 (trading-analysis-tool)',
  Accept: 'application/json',
};

// Fresh TTL cache
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes (OHLCV / volume)

// Last successful payloads — returned on 429 / network errors (stale-if-error)
const staleStore = new Map<string, unknown>();

// One in-flight request per cache key
const inflight = new Map<string, Promise<unknown>>();

// Per CoinGecko coin id: pause network calls after 429 (negative cache)
const rateLimitBackoffUntil = new Map<string, number>();
const RATE_LIMIT_BACKOFF_MS = 90 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttlMs: number = CACHE_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  staleStore.set(key, data);
}

function getStale<T>(key: string): T | null {
  const s = staleStore.get(key);
  return s !== undefined ? (s as T) : null;
}

function isRateLimited(id: string): boolean {
  return Date.now() < (rateLimitBackoffUntil.get(id) ?? 0);
}

function markRateLimited(id: string): void {
  rateLimitBackoffUntil.set(id, Date.now() + RATE_LIMIT_BACKOFF_MS);
}

function resolveId(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  return SYMBOL_TO_ID[upper] ?? null;
}

async function cgFetch(url: string): Promise<Response> {
  return fetch(url, { headers: DEFAULT_HEADERS });
}

async function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing !== undefined) {
    return existing as Promise<T>;
  }
  const p = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

export interface OHLCVCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketData {
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  ath: number;
  atl: number;
  priceChange7d: number;
}

export interface VolumePoint {
  time: number;
  volume: number;
}

export async function getOHLCV(symbol: string, days: number = 14): Promise<OHLCVCandle[]> {
  const id = resolveId(symbol);
  if (!id) {
    console.log(`[copilot][coingecko] Unknown symbol: ${symbol}`);
    return [];
  }

  const cacheKey = `ohlcv:${id}:${days}`;
  const hit = getCached<OHLCVCandle[]>(cacheKey);
  if (hit) return hit;

  if (isRateLimited(id)) {
    const stale = getStale<OHLCVCandle[]>(cacheKey);
    return stale ?? [];
  }

  return dedupe(cacheKey, async () => {
    try {
      // Use market_chart (daily close prices) for reliable coverage on the free tier.
      // The /ohlc endpoint auto-downsamples on the free tier and returns too few candles.
      const url = `${BASE_URL}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
      const res = await cgFetch(url);
      if (res.status === 429) {
        markRateLimited(id);
        console.log(`[copilot][coingecko] OHLCV fetch failed: 429 for ${symbol} — using stale if available`);
        return getStale<OHLCVCandle[]>(cacheKey) ?? [];
      }
      if (!res.ok) {
        console.log(`[copilot][coingecko] OHLCV fetch failed: ${res.status} for ${symbol}`);
        return getStale<OHLCVCandle[]>(cacheKey) ?? [];
      }

      const json = await res.json() as { prices?: Array<[number, number]> };
      if (!json.prices || !Array.isArray(json.prices) || json.prices.length === 0) {
        return getStale<OHLCVCandle[]>(cacheKey) ?? [];
      }

      // Construct daily candles from close prices.
      // open = previous day's close; high/low approximated from open and close.
      const prices = json.prices;
      const candles: OHLCVCandle[] = prices.map(([time, close], i) => {
        const open = i === 0 ? close : prices[i - 1][1];
        return {
          time,
          open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close,
        };
      });

      setCache(cacheKey, candles);
      return candles;
    } catch (err) {
      console.error(`[copilot][coingecko] getOHLCV error for ${symbol}:`, err);
      return getStale<OHLCVCandle[]>(cacheKey) ?? [];
    }
  });
}

export async function getMarketData(symbol: string): Promise<MarketData | null> {
  const id = resolveId(symbol);
  if (!id) {
    console.log(`[copilot][coingecko] Unknown symbol: ${symbol}`);
    return null;
  }

  const cacheKey = `market:${id}`;
  const hit = getCached<MarketData>(cacheKey);
  if (hit) return hit;

  if (isRateLimited(id)) {
    return getStale<MarketData>(cacheKey);
  }

  const MARKET_TTL = 3 * 60 * 1000;

  return dedupe(cacheKey, async () => {
    try {
      const url = `${BASE_URL}/coins/markets?vs_currency=usd&ids=${id}&price_change_percentage=7d`;
      const res = await cgFetch(url);
      if (res.status === 429) {
        markRateLimited(id);
        console.log(`[copilot][coingecko] Market data fetch failed: 429 for ${symbol} — using stale if available`);
        return getStale<MarketData>(cacheKey) ?? null;
      }
      if (!res.ok) {
        console.log(`[copilot][coingecko] Market data fetch failed: ${res.status} for ${symbol}`);
        return getStale<MarketData>(cacheKey) ?? null;
      }

      const json = await res.json() as Array<Record<string, unknown>>;
      if (!Array.isArray(json) || json.length === 0) return getStale<MarketData>(cacheKey) ?? null;

      const item = json[0];
      const data: MarketData = {
        price: Number(item.current_price ?? 0),
        change24h: Number(item.price_change_percentage_24h ?? 0),
        volume24h: Number(item.total_volume ?? 0),
        marketCap: Number(item.market_cap ?? 0),
        ath: Number(item.ath ?? 0),
        atl: Number(item.atl ?? 0),
        priceChange7d: Number(item.price_change_percentage_7d_in_currency ?? 0),
      };

      setCache(cacheKey, data, MARKET_TTL);
      return data;
    } catch (err) {
      console.error(`[copilot][coingecko] getMarketData error for ${symbol}:`, err);
      return getStale<MarketData>(cacheKey) ?? null;
    }
  });
}

export async function getVolumeHistory(symbol: string, days: number = 7): Promise<VolumePoint[]> {
  const id = resolveId(symbol);
  if (!id) {
    console.log(`[copilot][coingecko] Unknown symbol: ${symbol}`);
    return [];
  }

  const cacheKey = `volume:${id}:${days}`;
  const hit = getCached<VolumePoint[]>(cacheKey);
  if (hit) return hit;

  if (isRateLimited(id)) {
    const stale = getStale<VolumePoint[]>(cacheKey);
    return stale ?? [];
  }

  return dedupe(cacheKey, async () => {
    try {
      const url = `${BASE_URL}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
      const res = await cgFetch(url);
      if (res.status === 429) {
        markRateLimited(id);
        console.log(`[copilot][coingecko] Volume history fetch failed: 429 for ${symbol} — using stale if available`);
        return getStale<VolumePoint[]>(cacheKey) ?? [];
      }
      if (!res.ok) {
        console.log(`[copilot][coingecko] Volume history fetch failed: ${res.status} for ${symbol}`);
        return getStale<VolumePoint[]>(cacheKey) ?? [];
      }

      const json = await res.json() as { total_volumes?: Array<[number, number]> };
      if (!json.total_volumes || !Array.isArray(json.total_volumes)) {
        return getStale<VolumePoint[]>(cacheKey) ?? [];
      }

      const points: VolumePoint[] = json.total_volumes.map(([time, volume]) => ({ time, volume }));
      setCache(cacheKey, points);
      return points;
    } catch (err) {
      console.error(`[copilot][coingecko] getVolumeHistory error for ${symbol}:`, err);
      return getStale<VolumePoint[]>(cacheKey) ?? [];
    }
  });
}
