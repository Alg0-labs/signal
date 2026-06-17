// Rule-based chart-pattern detection over a candle window.
//
// Deliberately conservative: only the patterns that can be detected reliably with
// simple geometry are reported with real confidence (double top/bottom, channels,
// ranges). Head-and-shoulders is detected but always flagged low/with caution,
// because it is error-prone — better to under-claim than mislabel.
import type { TACandle } from './technical-analysis.js';

export interface PatternResult {
  name: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  description: string;
}

interface Swing { i: number; price: number; kind: 'high' | 'low' }

function swings(c: TACandle[], k = 2): Swing[] {
  const out: Swing[] = [];
  for (let i = k; i < c.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (c[j].high >= c[i].high) isH = false;
      if (c[j].low <= c[i].low) isL = false;
    }
    if (isH) out.push({ i, price: c[i].high, kind: 'high' });
    if (isL) out.push({ i, price: c[i].low, kind: 'low' });
  }
  return out.sort((a, b) => a.i - b.i);
}

const near = (a: number, b: number, tol = 0.035) => Math.abs(a - b) / ((a + b) / 2) < tol;

export function detectPattern(candles: TACandle[]): PatternResult | null {
  if (candles.length < 12) return null;
  const sw = swings(candles);
  const highs = sw.filter((s) => s.kind === 'high');
  const lows = sw.filter((s) => s.kind === 'low');
  const price = candles[candles.length - 1].close;

  // Double Top: two similar highs with a trough between, price now below the trough.
  if (highs.length >= 2) {
    const [h1, h2] = highs.slice(-2);
    const trough = Math.min(...candles.slice(h1.i, h2.i + 1).map((c) => c.low));
    if (near(h1.price, h2.price) && trough < h1.price * 0.97) {
      return {
        name: 'Double Top',
        bias: 'bearish',
        confidence: price < trough ? 'high' : 'medium',
        description: `Two highs near $${Math.round(h2.price).toLocaleString()} with a trough between — a bearish reversal pattern${price < trough ? ', now confirmed (price broke the neckline)' : ' (watch the neckline for confirmation)'}.`,
      };
    }
  }

  // Double Bottom: two similar lows with a peak between, price now above the peak.
  if (lows.length >= 2) {
    const [l1, l2] = lows.slice(-2);
    const peak = Math.max(...candles.slice(l1.i, l2.i + 1).map((c) => c.high));
    if (near(l1.price, l2.price) && peak > l1.price * 1.03) {
      return {
        name: 'Double Bottom',
        bias: 'bullish',
        confidence: price > peak ? 'high' : 'medium',
        description: `Two lows near $${Math.round(l2.price).toLocaleString()} with a peak between — a bullish reversal pattern${price > peak ? ', now confirmed (price broke the neckline)' : ' (watch the neckline for confirmation)'}.`,
      };
    }
  }

  // Head & Shoulders: three highs, middle highest, shoulders similar. Always cautious.
  if (highs.length >= 3) {
    const [a, b, c] = highs.slice(-3);
    if (b.price > a.price && b.price > c.price && near(a.price, c.price, 0.05)) {
      return {
        name: 'Possible Head & Shoulders',
        bias: 'bearish',
        confidence: 'low',
        description: `Three highs with a taller middle peak — a possible bearish reversal. Low confidence; treat as a hint, not a signal.`,
      };
    }
  }

  // Trend channels via swing slope.
  if (highs.length >= 2 && lows.length >= 2) {
    const hUp = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const lUp = lows[lows.length - 1].price > lows[lows.length - 2].price;
    const hDn = highs[highs.length - 1].price < highs[highs.length - 2].price;
    const lDn = lows[lows.length - 1].price < lows[lows.length - 2].price;
    if (hUp && lUp) return { name: 'Ascending Channel', bias: 'bullish', confidence: 'medium', description: 'Higher highs and higher lows — an upward channel.' };
    if (hDn && lDn) return { name: 'Descending Channel', bias: 'bearish', confidence: 'medium', description: 'Lower highs and lower lows — a downward channel.' };
    if (near(highs[highs.length - 1].price, highs[highs.length - 2].price, 0.03) && near(lows[lows.length - 1].price, lows[lows.length - 2].price, 0.03))
      return { name: 'Range / Consolidation', bias: 'neutral', confidence: 'medium', description: 'Flat highs and lows — price is ranging between support and resistance.' };
  }

  return { name: 'No clear pattern', bias: 'neutral', confidence: 'low', description: 'No reliable classical pattern in this window — read the trend and levels instead.' };
}
