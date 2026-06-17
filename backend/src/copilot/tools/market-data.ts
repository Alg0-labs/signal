// Unified market-data layer.
//
// PRIMARY source: Binance public API — real OHLCV candles (true high/low),
// 24h ticker, and per-day quote volume. No API key, no practical rate limit.
// This replaces CoinGecko as the price/candle/volume source because CoinGecko's
// free tier 429s under burst and only exposes daily *close* prices (its high/low
// were faked from open/close, corrupting RSI/MACD).
//
// FALLBACK: CoinGecko — used only when a symbol has no Binance USDT pair, and to
// enrich market cap / ATH / ATL (fields Binance does not provide).

import {
  getOHLCV as cgOHLCV,
  getMarketData as cgMarketData,
  getVolumeHistory as cgVolumeHistory,
  type OHLCVCandle,
  type MarketData,
  type VolumePoint,
} from './coingecko.js';

export type { OHLCVCandle, MarketData, VolumePoint };

const BINANCE = 'https://api.binance.com/api/v3';

// Symbols whose Binance pair differs from `${SYMBOL}USDT`.
const PAIR_OVERRIDES: Record<string, string> = {
  MATIC: 'POLUSDT', // Binance renamed MATIC -> POL
};

// Symbols with no Binance USDT spot pair — always defer to CoinGecko.
const NO_BINANCE = new Set(['USDC', 'USDT', 'DAI']);

function pairFor(symbol: string): string | null {
  const s = symbol.toUpperCase();
  if (NO_BINANCE.has(s)) return null;
  return PAIR_OVERRIDES[s] ?? `${s}USDT`;
}

// Short TTL cache (Binance is cheap, but this smooths bursty agent fan-out).
const cache = new Map<string, { data: unknown; expiresAt: number }>();
function cached<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return Promise.resolve(hit.data as T);
  return factory().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

async function bFetch(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(8000) });
}

// Binance kline row: [openTime, open, high, low, close, volume, closeTime, quoteVolume, ...]
type Kline = [number, string, string, string, string, string, number, string, ...unknown[]];

/** Real daily OHLCV candles from Binance, with CoinGecko fallback. */
export async function getOHLCV(symbol: string, days = 14): Promise<OHLCVCandle[]> {
  const pair = pairFor(symbol);
  if (!pair) return cgOHLCV(symbol, days);

  return cached(`ohlcv:${pair}:${days}`, 5 * 60 * 1000, async () => {
    try {
      const res = await bFetch(`${BINANCE}/klines?symbol=${pair}&interval=1d&limit=${days}`);
      if (!res.ok) throw new Error(`klines ${res.status}`);
      const rows = (await res.json()) as Kline[];
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty');
      return rows.map((k) => ({
        time: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
      }));
    } catch (err) {
      console.log(`[market-data] Binance OHLCV failed for ${symbol} (${err}); falling back to CoinGecko`);
      return cgOHLCV(symbol, days);
    }
  });
}

export interface VolCandle extends OHLCVCandle {
  volume: number; // quote volume (USD)
}

/**
 * Daily candles WITH volume — newest last. Optional `endMs` returns the `days`
 * candles ending at that timestamp (for analysing a clicked historical date).
 * Binance-only; returns [] for unsupported symbols.
 */
export async function getOHLCVV(symbol: string, days = 250, endMs?: number): Promise<VolCandle[]> {
  const pair = pairFor(symbol);
  if (!pair) return [];
  const endParam = endMs ? `&endTime=${Math.ceil(endMs)}` : '';
  try {
    const res = await bFetch(`${BINANCE}/klines?symbol=${pair}&interval=1d&limit=${Math.min(days, 1000)}${endParam}`);
    if (!res.ok) throw new Error(`klines ${res.status}`);
    const rows = (await res.json()) as Kline[];
    return rows.map((k) => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[7]), // quote volume = USD
    }));
  } catch (err) {
    console.log(`[market-data] Binance OHLCVV failed for ${symbol} (${err})`);
    return [];
  }
}

/** 24h market data from Binance; market cap / ATH / ATL enriched from CoinGecko. */
export async function getMarketData(symbol: string): Promise<MarketData | null> {
  const pair = pairFor(symbol);
  if (!pair) return cgMarketData(symbol);

  return cached(`market:${pair}`, 60 * 1000, async () => {
    try {
      // 24h ticker + recent daily candles (for the 7d change) in parallel.
      const [tickerRes, klineRes] = await Promise.all([
        bFetch(`${BINANCE}/ticker/24hr?symbol=${pair}`),
        bFetch(`${BINANCE}/klines?symbol=${pair}&interval=1d&limit=8`),
      ]);
      if (!tickerRes.ok) throw new Error(`ticker ${tickerRes.status}`);
      const t = (await tickerRes.json()) as Record<string, string>;

      let priceChange7d = 0;
      if (klineRes.ok) {
        const rows = (await klineRes.json()) as Kline[];
        if (rows.length >= 2) {
          const weekAgo = Number(rows[0][4]);
          const now = Number(rows[rows.length - 1][4]);
          if (weekAgo > 0) priceChange7d = ((now - weekAgo) / weekAgo) * 100;
        }
      }

      const price = Number(t.lastPrice);
      const base: MarketData = {
        price,
        change24h: Number(t.priceChangePercent),
        volume24h: Number(t.quoteVolume), // USD-denominated
        marketCap: 0,
        ath: 0,
        atl: 0,
        priceChange7d,
      };

      // Best-effort enrichment for fields Binance lacks; never block on it.
      try {
        const cg = await cgMarketData(symbol);
        if (cg) {
          base.marketCap = cg.marketCap || 0;
          base.ath = cg.ath || 0;
          base.atl = cg.atl || 0;
          if (!base.priceChange7d) base.priceChange7d = cg.priceChange7d || 0;
        }
      } catch { /* enrichment optional */ }

      return base;
    } catch (err) {
      console.log(`[market-data] Binance market failed for ${symbol} (${err}); falling back to CoinGecko`);
      return cgMarketData(symbol);
    }
  });
}

/** Per-day USD volume history from Binance daily klines, with CoinGecko fallback. */
export async function getVolumeHistory(symbol: string, days = 7): Promise<VolumePoint[]> {
  const pair = pairFor(symbol);
  if (!pair) return cgVolumeHistory(symbol, days);

  return cached(`volume:${pair}:${days}`, 5 * 60 * 1000, async () => {
    try {
      const res = await bFetch(`${BINANCE}/klines?symbol=${pair}&interval=1d&limit=${days}`);
      if (!res.ok) throw new Error(`klines ${res.status}`);
      const rows = (await res.json()) as Kline[];
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty');
      return rows.map((k) => ({ time: Number(k[0]), volume: Number(k[7]) })); // quote volume = USD
    } catch (err) {
      console.log(`[market-data] Binance volume failed for ${symbol} (${err}); falling back to CoinGecko`);
      return cgVolumeHistory(symbol, days);
    }
  });
}
