"use client";

import { type Technicals, type Analogs, type Pattern, type OrderFlow } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const fmt = (n: number | null) =>
  n === null ? "—" : n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2);

const GREEN = "#34d399";
const RED = "#fb6a82";
const AMBER = "#fbbf24";

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
      <p className="text-xs font-bold font-mono mt-0.5" style={{ color: color ?? "#f4f5fb" }}>{value}</p>
    </div>
  );
}

/**
 * Deterministic analysis card — always the same layout, rendered from the
 * computed TA engine + historical analogs (never from LLM prose).
 */
export function AnalysisCard({ ta, analogs, pattern, orderFlow }: { ta: Technicals; analogs: Analogs | null; pattern?: Pattern | null; orderFlow?: OrderFlow | null }) {
  const up = ta.trend.direction === "uptrend";
  const down = ta.trend.direction === "downtrend";
  const trendColor = up ? GREEN : down ? RED : AMBER;
  const TrendIcon = up ? TrendingUp : down ? TrendingDown : Minus;

  const ma = ta.movingAverages;
  const volColor = ta.volume.ratio >= 1.3 ? GREEN : ta.volume.ratio <= 0.6 ? RED : AMBER;
  const rsiColor =
    ta.momentum.rsiState === "overbought" ? RED : ta.momentum.rsiState === "oversold" ? GREEN : "#f4f5fb";

  return (
    <div className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-xl p-3 mb-2 text-left">
      {/* Trend header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5" style={{ color: trendColor }}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span className="text-xs font-bold uppercase">{ta.trend.direction}</span>
          <span className="text-[10px] text-[var(--text-secondary)]">({ta.trend.strength})</span>
        </div>
        <span className="text-xs font-mono text-[var(--text-primary)]">${fmt(ta.price)}</span>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-4 gap-2 mb-2.5">
        <Metric label="RSI" value={ta.momentum.rsi !== null ? ta.momentum.rsi.toFixed(0) : "—"} color={rsiColor} />
        <Metric label="MACD" value={ta.momentum.macdState} color={ta.momentum.macdState === "bullish" ? GREEN : ta.momentum.macdState === "bearish" ? RED : "#b4b8c9"} />
        <Metric label="MA Stack" value={ma.stack} color={ma.stack === "bullish" ? GREEN : ma.stack === "bearish" ? RED : AMBER} />
        <Metric label="Vol" value={`${ta.volume.ratio.toFixed(2)}×`} color={volColor} />
      </div>

      {/* Moving averages + correlation */}
      <div className="grid grid-cols-4 gap-2 mb-2.5">
        <Metric label="MA20" value={fmt(ma.ma20)} />
        <Metric label="MA50" value={fmt(ma.ma50)} />
        <Metric label="MA200" value={fmt(ma.ma200)} />
        <Metric
          label="BTC corr"
          value={ta.correlation.withBTC !== null ? ta.correlation.withBTC.toFixed(2) : "—"}
          color={ta.correlation.withBTC !== null && Math.abs(ta.correlation.withBTC) > 0.7 ? AMBER : "#f4f5fb"}
        />
      </div>

      {/* Detected pattern (range-select) */}
      {pattern && pattern.name !== "No clear pattern" && (
        <div className="mb-2.5 flex items-center gap-2 bg-white/[0.03] rounded-lg px-2 py-1.5">
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Pattern</span>
          <span
            className="text-xs font-bold"
            style={{ color: pattern.bias === "bullish" ? GREEN : pattern.bias === "bearish" ? RED : AMBER }}
          >
            {pattern.name}
          </span>
          <span className="text-[9px] text-[var(--text-secondary)] uppercase">{pattern.confidence} conf</span>
        </div>
      )}

      {/* Support / Resistance */}
      {ta.levels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {ta.levels.map((l, i) => (
            <span
              key={i}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded-md"
              style={{
                color: l.kind === "support" ? GREEN : RED,
                background: l.kind === "support" ? "rgba(52,211,153,0.1)" : "rgba(251,106,130,0.1)",
              }}
              title={`${l.kind} · ${l.touches} touches`}
            >
              {l.kind === "support" ? "S" : "R"} ${fmt(l.price)} ({l.distancePct >= 0 ? "+" : ""}
              {l.distancePct.toFixed(1)}%)
              {l.touches > 1 && <span className="opacity-60"> ×{l.touches}</span>}
            </span>
          ))}
        </div>
      )}

      {/* Order flow (live) */}
      {orderFlow && (
        <div className="grid grid-cols-3 gap-2 mb-2.5 pt-2 border-t border-[var(--border)]">
          <Metric
            label="Taker buy"
            value={`${orderFlow.buyVolumePct.toFixed(0)}%`}
            color={orderFlow.cvdTrend === "accumulation" ? GREEN : orderFlow.cvdTrend === "distribution" ? RED : AMBER}
          />
          <Metric
            label="CVD 24h"
            value={orderFlow.cvdTrend}
            color={orderFlow.cvdTrend === "accumulation" ? GREEN : orderFlow.cvdTrend === "distribution" ? RED : "#b4b8c9"}
          />
          <Metric
            label="Book"
            value={`${(orderFlow.bookImbalance * 100).toFixed(0)}% bid`}
            color={orderFlow.bookBias === "bid-heavy" ? GREEN : orderFlow.bookBias === "ask-heavy" ? RED : "#b4b8c9"}
          />
        </div>
      )}

      {/* Historical analogs */}
      {analogs && (
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-[var(--accent)] uppercase tracking-wider font-semibold">🕰️ Historical echo</span>
            <span className="text-[9px] text-[var(--text-muted)]">{analogs.sampleSize} analogs</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Up 3d" value={`${analogs.bullishPct3d.toFixed(0)}%`} color={analogs.bullishPct3d >= 50 ? GREEN : RED} />
            <Metric label="Avg 3d" value={`${analogs.avgRet3d >= 0 ? "+" : ""}${analogs.avgRet3d.toFixed(1)}%`} color={analogs.avgRet3d >= 0 ? GREEN : RED} />
            <Metric label="Avg 7d" value={`${analogs.avgRet7d >= 0 ? "+" : ""}${analogs.avgRet7d.toFixed(1)}%`} color={analogs.avgRet7d >= 0 ? GREEN : RED} />
          </div>
          {analogs.matches[0] && (
            <p className="text-[9px] text-[var(--text-muted)] mt-1.5">
              Closest: {new Date(analogs.matches[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
              ({(analogs.matches[0].similarity * 100).toFixed(0)}% similar)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
