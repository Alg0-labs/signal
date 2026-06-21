"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Floating field of 3D crypto coins for the landing background.
 *
 * Uses Craftwork's spinning-coin clips (https://coins.craftwork.design),
 * re-encoded to transparent (alpha) WebM in /public/coins/<sym>.webm — so they
 * render directly on the dark theme with no blend tricks. If a clip is missing
 * or fails to load, that coin falls back to a CSS-rendered 3D coin, so the
 * background always looks intentional.
 */
const USE_CRAFTWORK_VIDEOS = true;

type Coin = {
  sym: string;
  light: string;
  base: string;
  edge: string;
  glyph: string;
  size: number;
  left: string;
  top: string;
  blur: number;
  op: number;
  dur: number;
  delay: number;
  drift: number;
  rot: number;
};

// Spread around the edges (and depth planes) so coins never sit behind the
// headline text. Near = big/sharp/opaque, far = small/blurred/faint.
const COINS: Coin[] = [
  // ── near plane (prominent, hero corners) ──
  { sym: "btc",   light: "#fdc664", base: "#f7931a", edge: "#b9710d", glyph: "₿", size: 86, left: "4%",  top: "14%", blur: 0, op: 1,    dur: 7.5,  delay: 0,   drift: 16,  rot: 7 },
  { sym: "eth",   light: "#9bb0f7", base: "#627eea", edge: "#3a55b6", glyph: "Ξ", size: 74, left: "89%", top: "18%", blur: 0, op: 1,    dur: 8.5,  delay: 0.6, drift: -18, rot: -9 },
  { sym: "sol",   light: "#8ff0c6", base: "#14b87f", edge: "#0c7d56", glyph: "S", size: 58, left: "82%", top: "58%", blur: 0, op: 0.9,  dur: 9.5,  delay: 1.2, drift: 13,  rot: 11 },
  { sym: "bnb",   light: "#f7d56e", base: "#f3ba2f", edge: "#c2900f", glyph: "B", size: 54, left: "9%",  top: "60%", blur: 0, op: 0.9,  dur: 8.8,  delay: 0.3, drift: -11, rot: -7 },
  // ── mid plane ──
  { sym: "avax",  light: "#f37a7b", base: "#e84142", edge: "#b5282a", glyph: "A", size: 46, left: "3%",  top: "38%", blur: 1, op: 0.72, dur: 10.2, delay: 1.5, drift: 10,  rot: 8 },
  { sym: "link",  light: "#8aaef5", base: "#2a5ada", edge: "#1c3e9c", glyph: "L", size: 48, left: "93%", top: "42%", blur: 1, op: 0.72, dur: 9.8,  delay: 0.9, drift: -9,  rot: 6 },
  { sym: "matic", light: "#b79bf7", base: "#8247e5", edge: "#5b2ea6", glyph: "M", size: 42, left: "15%", top: "80%", blur: 1, op: 0.62, dur: 11,   delay: 2.0, drift: -12, rot: -10 },
  { sym: "dot",   light: "#f56bb0", base: "#e6007a", edge: "#a80659", glyph: "D", size: 44, left: "88%", top: "78%", blur: 1, op: 0.62, dur: 10.6, delay: 0.5, drift: 12,  rot: 9 },
  // ── far plane (faint, blurred, parallax) ──
  { sym: "trx",   light: "#f4566f", base: "#eb0029", edge: "#b00020", glyph: "T", size: 34, left: "25%", top: "8%",  blur: 2, op: 0.5,  dur: 12,   delay: 1.1, drift: 9,   rot: 12 },
  { sym: "usdt",  light: "#7fd6c8", base: "#26a17b", edge: "#177a5a", glyph: "₮", size: 36, left: "71%", top: "9%",  blur: 2, op: 0.5,  dur: 11.4, delay: 2.4, drift: -8,  rot: -11 },
  { sym: "atom",  light: "#6b6fa0", base: "#2e3148", edge: "#1d1f33", glyph: "⚛", size: 32, left: "5%",  top: "86%", blur: 3, op: 0.42, dur: 12.5, delay: 0.8, drift: 8,   rot: 10 },
  { sym: "ton",   light: "#5cc4f5", base: "#0098ea", edge: "#0072b0", glyph: "T", size: 30, left: "95%", top: "11%", blur: 3, op: 0.42, dur: 13,   delay: 1.9, drift: -10, rot: 13 },
];

function CssCoin({ c }: { c: Coin }) {
  const sheen = Math.round(c.size * 0.1);
  return (
    <div
      className="w-full h-full rounded-full grid place-items-center"
      style={{
        background: `radial-gradient(circle at 34% 28%, ${c.light} 0%, ${c.base} 52%, ${c.edge} 100%)`,
        border: "1px solid rgba(255,255,255,0.28)",
        boxShadow: `0 ${sheen}px 0 ${c.edge}, 0 ${Math.round(c.size * 0.16)}px ${Math.round(c.size * 0.3)}px rgba(0,0,0,0.5)`,
      }}
    >
      <span
        className="font-bold text-white/90 leading-none"
        style={{ fontSize: c.size * 0.42, textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
      >
        {c.glyph}
      </span>
      <span
        className="absolute rounded-full pointer-events-none"
        style={{ inset: "8%", background: "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 42%)" }}
      />
    </div>
  );
}

function Coin({ c }: { c: Coin }) {
  const [failed, setFailed] = useState(false);
  const useVideo = USE_CRAFTWORK_VIDEOS && !failed;

  return (
    <div
      className="relative rounded-full"
      style={{ width: c.size, height: c.size, filter: c.blur ? `blur(${c.blur}px)` : undefined }}
    >
      {useVideo ? (
        <video
          src={`/coins/${c.sym}.webm`}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setFailed(true)}
          className="w-full h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        />
      ) : (
        <CssCoin c={c} />
      )}
    </div>
  );
}

export function CoinField() {
  const reduced = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {COINS.map((c, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: c.left, top: c.top, opacity: c.op }}
          initial={false}
          animate={reduced ? undefined : { y: [0, -22, 0], x: [0, c.drift, 0], rotate: [0, c.rot, 0] }}
          transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          <Coin c={c} />
        </motion.div>
      ))}
    </div>
  );
}
