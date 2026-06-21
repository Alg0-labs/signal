"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MousePointer2, Sparkles, CandlestickChart, History, Newspaper } from "lucide-react";

/**
 * Self-running landing demo: a cursor selects a candle → the request travels
 * to the RAG analyst → it returns a technical read with a backtest.
 * Loops cleanly. Falls back to the final (result) frame for reduced motion.
 */

const N = 12;
const TARGET = 7; // the breakdown candle the cursor picks
const TARGET_LEFT = `${((TARGET + 0.5) * 100) / N}%`;

// Earlier window we point back to as "the same formation, last time"
const ANALOG_START = 1;
const ANALOG_SPAN = 3;
const ANALOG_LEFT = `${(ANALOG_START * 100) / N}%`;
const ANALOG_WIDTH = `${(ANALOG_SPAN * 100) / N}%`;
const ANALOG_CENTER = `${((ANALOG_START + ANALOG_SPAN / 2) * 100) / N}%`;

// o/c/h/l normalized 0..1 (1 = top of panel). Double-top then a breakdown at TARGET.
const CANDLES = [
  { o: 0.30, c: 0.38, h: 0.42, l: 0.28 },
  { o: 0.38, c: 0.45, h: 0.49, l: 0.36 },
  { o: 0.45, c: 0.53, h: 0.56, l: 0.43 },
  { o: 0.53, c: 0.61, h: 0.65, l: 0.51 },
  { o: 0.61, c: 0.69, h: 0.73, l: 0.59 }, // top 1
  { o: 0.69, c: 0.62, h: 0.71, l: 0.60 },
  { o: 0.62, c: 0.70, h: 0.74, l: 0.60 }, // top 2
  { o: 0.70, c: 0.49, h: 0.72, l: 0.47 }, // ← breakdown (TARGET)
  { o: 0.49, c: 0.44, h: 0.52, l: 0.41 },
  { o: 0.44, c: 0.47, h: 0.51, l: 0.42 },
  { o: 0.47, c: 0.43, h: 0.50, l: 0.40 },
  { o: 0.43, c: 0.46, h: 0.49, l: 0.41 },
];

// Phase timeline (ms)
const PHASES = [
  { id: "aim", ms: 2000 },
  { id: "select", ms: 2000 },
  { id: "send", ms: 1300 },
  { id: "think", ms: 2000 },
  { id: "result", ms: 5800 },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

export function ChartAnalystDemo() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(reduced ? 4 : 0);

  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setPhase((p) => (p + 1) % PHASES.length), PHASES[phase].ms);
    return () => clearTimeout(t);
  }, [phase, reduced]);

  const selected = phase >= 1;

  return (
    <div className="sm:w-80 shrink-0 space-y-2.5 select-none" aria-hidden>
      {/* ── Chart panel ── */}
      <div className="relative rounded-xl bg-[var(--bg-elev)] border border-[var(--border)] p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[var(--text-secondary)]">ETH · 1D</span>
          <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">click a candle</span>
        </div>

        <div className="relative h-24">
          {/* candles */}
          {CANDLES.map((c, i) => {
            const up = c.c >= c.o;
            const col = up ? "var(--success)" : "var(--danger)";
            const top = (1 - Math.max(c.o, c.c)) * 100;
            const bodyH = Math.max(Math.abs(c.c - c.o) * 100, 4);
            const wickTop = (1 - c.h) * 100;
            const wickH = (c.h - c.l) * 100;
            const inAnalog = i >= ANALOG_START && i < ANALOG_START + ANALOG_SPAN;
            const highlight = i === TARGET || (phase === 4 && inAnalog);
            const op = selected ? (highlight ? 1 : 0.18) : i === TARGET ? 0.85 : 0.55;
            return (
              <div key={i} className="absolute bottom-0 top-0"
                style={{ left: `${(i * 100) / N}%`, width: `${100 / N}%` }}>
                <div className="absolute left-1/2 -translate-x-1/2 transition-opacity duration-500"
                  style={{ top: `${wickTop}%`, height: `${wickH}%`, width: 2, background: col, opacity: op }} />
                <div className="absolute left-1/2 -translate-x-1/2 rounded-[1px] transition-opacity duration-500"
                  style={{ top: `${top}%`, height: `${bodyH}%`, width: "56%", background: col, opacity: op }} />
              </div>
            );
          })}

          {/* selection ring */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="absolute top-0 bottom-0 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)]"
                style={{ left: `${(TARGET * 100) / N}%`, width: `${100 / N}%` }}
              />
            )}
          </AnimatePresence>

          {/* tooltip on the selected candle */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="absolute -translate-x-1/2 -top-0.5 px-1.5 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-bright)] text-[9px] font-medium text-[var(--text-primary)] whitespace-nowrap shadow-[var(--shadow-md)]"
                style={{ left: TARGET_LEFT }}
              >
                Jan 12 · <span className="text-[var(--danger)]">−5.2%</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* analog: the same formation, earlier on the chart (shown with the result) */}
          <AnimatePresence>
            {phase === 4 && (
              <>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.8, ease: EASE }}
                  className="absolute top-0 bottom-0 rounded-md border border-dashed border-[var(--danger)]/70"
                  style={{ left: ANALOG_LEFT, width: ANALOG_WIDTH }}
                />
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.9, ease: EASE }}
                  className="absolute -translate-x-1/2 -top-0.5 px-1.5 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-bright)] text-[9px] font-medium text-[var(--text-primary)] whitespace-nowrap shadow-[var(--shadow-md)]"
                  style={{ left: ANALOG_CENTER }}
                >
                  Nov 8 · <span className="text-[var(--danger)]">−6%</span>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* cursor: travels in (phase 0), clicks (phase 1) */}
          {phase === 0 && (
            <motion.div
              key="cursor-move"
              className="absolute z-20"
              initial={{ left: "12%", top: "78%", opacity: 0 }}
              animate={{ left: TARGET_LEFT, top: "42%", opacity: 1 }}
              transition={{ duration: 1.7, ease: EASE }}
            >
              <MousePointer2 className="w-3.5 h-3.5 text-[var(--text-primary)] fill-[var(--text-primary)] drop-shadow" />
            </motion.div>
          )}
          {phase === 1 && (
            <div className="absolute z-20" style={{ left: TARGET_LEFT, top: "42%" }}>
              <MousePointer2 className="w-3.5 h-3.5 text-[var(--text-primary)] fill-[var(--text-primary)] drop-shadow" />
              <motion.span
                className="absolute -left-2 -top-2 w-5 h-5 rounded-full border border-[var(--accent)]"
                initial={{ scale: 0.3, opacity: 0.7 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Flow + RAG chip ── */}
      <div className="relative flex items-center justify-center py-0.5">
        {phase === 2 && (
          <motion.span
            className="absolute z-10 w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
            initial={{ y: -24, opacity: 0, scale: 0.5 }}
            animate={{ y: 4, opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{ duration: 0.9, ease: EASE }}
          />
        )}
        <motion.div
          animate={
            phase === 2 ? { scale: [1, 1.06, 1], borderColor: "var(--accent)" }
            : phase === 3 ? { scale: 1 }
            : { scale: 1 }
          }
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent-soft)] border border-[var(--border-bright)]"
        >
          <Sparkles className="w-3 h-3 text-[var(--accent)]" />
          <span className="text-[10px] font-semibold text-[var(--text-primary)]">RAG analyst</span>
          {phase === 3 && (
            <span className="flex gap-0.5 ml-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="w-1 h-1 rounded-full bg-[var(--accent)]"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -1.5, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </span>
          )}
        </motion.div>
      </div>

      {/* ── Output panel (fixed height, content cross-fades) ── */}
      <div className="relative rounded-xl bg-[var(--bg-elev)] border border-[var(--border)] p-3 min-h-[188px] overflow-hidden">
        <AnimatePresence mode="wait">
          {phase === 4 ? (
            <motion.div key="result"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Formation recognized</span>
                <span className="tag tag-red">Bearish</span>
              </div>

              {/* what the formation is */}
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
                className="flex items-start gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5">
                <CandlestickChart className="w-3 h-3 text-[var(--danger)] mt-0.5 shrink-0" />
                <p className="text-[10px] text-[var(--text-secondary)] leading-snug">
                  <span className="text-[var(--text-primary)] font-semibold">Double top + bearish engulfing</span> rejecting $3,420 resistance · RSI 78
                </p>
              </motion.div>

              {/* same formation seen before + how it resolved — ties to the Nov 8 marker */}
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.9, ease: EASE }}
                className="flex items-start gap-1.5 rounded-lg bg-[var(--accent-soft)] border border-[var(--border-bright)] px-2 py-1.5">
                <History className="w-3 h-3 text-[var(--accent)] mt-0.5 shrink-0" />
                <p className="text-[9px] text-[var(--text-secondary)] leading-snug">
                  Same setup last printed <span className="text-[var(--text-primary)] font-semibold">Nov 8</span> — matched{" "}
                  <span className="text-[var(--text-primary)] font-semibold tabular">24×</span> total ·{" "}
                  <span className="text-[var(--danger)] font-semibold tabular">71%</span> broke lower within 3d
                </p>
              </motion.div>

              {/* news from the same timeline as the candle */}
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 1.7, ease: EASE }}
                className="flex items-start gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5">
                <Newspaper className="w-3 h-3 text-[var(--text-secondary)] mt-0.5 shrink-0" />
                <p className="text-[9px] text-[var(--text-secondary)] leading-snug">
                  <span className="text-[var(--text-primary)] font-semibold">Jan 12 headlines:</span> hotter-than-expected CPI print hit risk assets
                </p>
              </motion.div>
            </motion.div>
          ) : phase === 3 ? (
            <motion.div key="think"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }} className="space-y-2 pt-1">
              <p className="text-[10px] text-[var(--text-secondary)]">Matching candle formations + same-day news…</p>
              {[90, 70, 80, 60].map((w, i) => (
                <div key={i} className="skeleton h-3 rounded-md" style={{ width: `${w}%` }} />
              ))}
            </motion.div>
          ) : (
            <motion.div key="idle"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="h-full flex flex-col items-center justify-center text-center gap-1">
              <p className="text-[10px] text-[var(--text-muted)]">Candle formations · prior matches · same-day news</p>
              <p className="text-[9px] text-[var(--text-muted)]/70">Pick a candle to see the analysis</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
