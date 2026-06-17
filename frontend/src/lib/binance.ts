// Free Binance public market data — no API key required.
// REST for historical klines + 24h stats, WebSocket for real-time candle updates.

import type { UTCTimestamp } from "lightweight-charts";

const REST_BASE = "https://api.binance.com/api/v3";
const WS_BASE = "wss://stream.binance.com:9443/ws";

export type Interval = "15m" | "1h" | "4h" | "1d";

export const INTERVALS: { label: string; value: Interval }[] = [
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];

// Map our internal tickers to Binance spot pairs. Falls back to <SYMBOL>USDT.
const PAIR_OVERRIDES: Record<string, string> = {
  MATIC: "POLUSDT", // Binance renamed MATIC -> POL
};

export function symbolToPair(symbol: string): string {
  const s = symbol.toUpperCase();
  return PAIR_OVERRIDES[s] ?? `${s}USDT`;
}

export interface Candle {
  time: UTCTimestamp; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Stats24h {
  lastPrice: number;
  priceChangePercent: number;
  high: number;
  low: number;
  quoteVolume: number; // 24h volume in USDT
}

/** Historical candles to seed the chart. */
export async function fetchKlines(
  pair: string,
  interval: Interval,
  limit = 300
): Promise<Candle[]> {
  const url = `${REST_BASE}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);
  const raw: unknown[][] = await res.json();
  return raw.map((k) => ({
    time: (Number(k[0]) / 1000) as UTCTimestamp,
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

/** 24h rolling stats for the header strip. */
export async function fetch24hStats(pair: string): Promise<Stats24h> {
  const res = await fetch(`${REST_BASE}/ticker/24hr?symbol=${pair}`);
  if (!res.ok) throw new Error(`Binance 24hr ${res.status}`);
  const d = await res.json();
  return {
    lastPrice: Number(d.lastPrice),
    priceChangePercent: Number(d.priceChangePercent),
    high: Number(d.highPrice),
    low: Number(d.lowPrice),
    quoteVolume: Number(d.quoteVolume),
  };
}

/**
 * Real-time kline stream. Calls `onCandle` ~1x/sec with the live (still-forming)
 * candle. Returns a cleanup function that closes the socket.
 */
export function openKlineStream(
  pair: string,
  interval: Interval,
  onCandle: (c: Candle) => void
): () => void {
  const ws = new WebSocket(
    `${WS_BASE}/${pair.toLowerCase()}@kline_${interval}`
  );

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    const k = msg.k;
    if (!k) return;
    onCandle({
      time: (Number(k.t) / 1000) as UTCTimestamp,
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
    });
  };

  return () => {
    ws.onmessage = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
}
