"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { spring } from "@/components/ui/motion";
import { signalApi, type QuickCheckResult, type DeepAnalysisResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Zap, TrendingUp, TrendingDown, Activity,
  Newspaper, Waves, ArrowRight, DollarSign, Brain,
} from "lucide-react";

const POPULAR_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "AVAX", "MATIC", "ARB"];

// Palette — single source so signal/verdict colors stay consistent.
const C = {
  success: "#34d399",
  danger: "#fb6a82",
  warning: "#fbbf24",
  accent: "#8b7bf6",
  info: "#60a5fa",
} as const;

// ─── Shared state type (lifted to page) ──────────────────────────────────────

export interface CopilotState {
  symbol: string;
  action: "BUY" | "SELL";
  amount: string;
  quickResult: QuickCheckResult | null;
  deepResult: DeepAnalysisResult | null;
  deepLoading: boolean;
  deepProgress: number;
  deepError: string | null;
}

export const defaultCopilotState: CopilotState = {
  symbol: "BTC",
  action: "BUY",
  amount: "",
  quickResult: null,
  deepResult: null,
  deepLoading: false,
  deepProgress: 0,
  deepError: null,
};

// ─── Signal card ──────────────────────────────────────────────────────────────

interface SignalCardProps {
  label: string;
  value: string;
  confidence: number;
  details: string;
  icon: React.ElementType;
  colorHint?: "green" | "red" | "yellow";
}

function SignalCard({ label, value, confidence, details, icon: Icon, colorHint }: SignalCardProps) {
  const color = colorHint === "green" ? C.success : colorHint === "red" ? C.danger : C.warning;
  return (
    <div className="p-3 rounded-xl bg-white/[0.04] border border-[var(--border)] hover:border-[var(--border-bright)] transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3" style={{ color }} />
          <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-[10px] font-bold capitalize" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 bg-[var(--border)] rounded-full mb-1.5 overflow-hidden">
        <motion.div className="h-full rounded-full"
          initial={{ width: 0 }} animate={{ width: `${confidence * 100}%` }}
          transition={{ ...spring, stiffness: 120 }}
          style={{ background: color }} />
      </div>
      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed line-clamp-2">{details}</p>
    </div>
  );
}

// ─── Input Panel ─────────────────────────────────────────────────────────────

interface InputPanelProps {
  state: CopilotState;
  onChange: (patch: Partial<CopilotState>) => void;
  onResult: (r: QuickCheckResult) => void;
}

export function InputPanel({ state, onChange, onResult }: InputPanelProps) {
  const mutation = useMutation({
    mutationFn: () => signalApi.quickCheck(state.symbol.toUpperCase(), state.action),
    onSuccess: (res) => onResult(res.data),
  });

  const chip = (active: boolean) =>
    cn("px-2.5 py-0.5 rounded-lg text-[10px] font-semibold border transition-all active:scale-[0.95]",
      active
        ? "bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]"
        : "bg-white/5 border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)] hover:text-[var(--text-primary)]");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quick Check</CardTitle>
          <Badge variant="purple" dot>AI</Badge>
        </CardHeader>
        <div className="space-y-3.5">
          {/* Symbol */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Token</label>
            <input
              value={state.symbol}
              onChange={(e) => onChange({ symbol: e.target.value.toUpperCase() })}
              placeholder="BTC, ETH, SOL..."
              className="w-full bg-[var(--bg-elev)] border border-[var(--border)] rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {POPULAR_SYMBOLS.map((s) => (
                <button key={s} onClick={() => onChange({ symbol: s })} className={chip(state.symbol === s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Position Size (USD)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <input type="number" value={state.amount}
                onChange={(e) => onChange({ amount: e.target.value })}
                placeholder="e.g. 1000" min="0"
                className="w-full bg-[var(--bg-elev)] border border-[var(--border)] rounded-[var(--radius-control)] pl-8 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] tabular focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all" />
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {["100", "500", "1000", "5000"].map((v) => (
                <button key={v} onClick={() => onChange({ amount: v })}
                  className={cn("flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-all active:scale-[0.95]",
                    state.amount === v
                      ? "bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]"
                      : "bg-white/[0.04] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}>
                  ${v}
                </button>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Direction</label>
            <div className="flex gap-2">
              <button onClick={() => onChange({ action: "BUY" })}
                className={cn("flex-1 py-2 rounded-[var(--radius-control)] text-xs font-semibold border transition-all active:scale-[0.97]",
                  state.action === "BUY"
                    ? "bg-[rgba(52,211,153,0.15)] border-[rgba(52,211,153,0.4)] text-[var(--success)]"
                    : "bg-white/[0.04] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}>
                <TrendingUp className="w-3 h-3 inline mr-1" />Long
              </button>
              <button onClick={() => onChange({ action: "SELL" })}
                className={cn("flex-1 py-2 rounded-[var(--radius-control)] text-xs font-semibold border transition-all active:scale-[0.97]",
                  state.action === "SELL"
                    ? "bg-[rgba(251,106,130,0.15)] border-[rgba(251,106,130,0.4)] text-[var(--danger)]"
                    : "bg-white/[0.04] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}>
                <TrendingDown className="w-3 h-3 inline mr-1" />Short
              </button>
            </div>
          </div>

          <Button variant="primary" size="lg" className="w-full" loading={mutation.isPending}
            onClick={() => mutation.mutate()}>
            <Zap className="w-4 h-4" />Run Analysis
          </Button>

          {mutation.isError && (
            <p className="text-xs text-[var(--danger)] px-1">
              {(mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error
                ?? "Backend not reachable on port 3001"}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Quick Results Panel ──────────────────────────────────────────────────────

interface QuickResultsPanelProps {
  state: CopilotState;
  onStartDeep: () => void;
}

export function QuickResultsPanel({ state, onStartDeep }: QuickResultsPanelProps) {
  const r = state.quickResult;
  if (!r) {
    return (
      <EmptyState
        icon={Zap}
        title="No analysis yet"
        description="Pick a token and direction on the left, then run a quick check to see four AI signals here."
        hint="Tip: start with BTC or ETH"
        className="h-64 justify-center"
      />
    );
  }

  const rec = r.recommendation;
  const recColor = rec === "EXECUTE" ? C.success : rec === "CAUTION" ? C.warning : C.danger;
  const recVariant = (rec === "EXECUTE" ? "green" : rec === "CAUTION" ? "yellow" : "red") as "green" | "yellow" | "red";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="space-y-3 h-full">
      {/* Recommendation */}
      <div className="p-4 rounded-2xl border relative overflow-hidden text-center"
        style={{ background: `color-mix(in srgb, ${recColor} 9%, transparent)`, borderColor: `color-mix(in srgb, ${recColor} 30%, transparent)` }}>
        <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
          {state.symbol} · {state.action}{state.amount ? ` · $${Number(state.amount).toLocaleString()}` : ""}
        </p>
        <p className="text-3xl font-semibold tracking-tight" style={{ color: recColor }}>{rec}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant={recVariant}>{(r.confidence * 100).toFixed(0)}% conf</Badge>
          <Badge variant={r.severity === "high" ? "red" : r.severity === "medium" ? "yellow" : "green"}>{r.severity} risk</Badge>
          <span className="text-[9px] text-[var(--text-muted)] tabular">{r.executionTimeMs}ms</span>
        </div>
      </div>

      {/* Insights */}
      <Card>
        <CardHeader><CardTitle>Insights</CardTitle></CardHeader>
        <ul className="space-y-1.5">
          {r.insights.map((insight, i) => (
            <li key={i} className="flex gap-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <span className="text-[var(--accent)] flex-shrink-0 mt-0.5">▸</span>{insight}
            </li>
          ))}
        </ul>
      </Card>

      {/* 4 signals */}
      <div className="grid grid-cols-2 gap-2">
        <SignalCard label="Momentum" icon={Activity}
          value={r.signals.momentum.trend} confidence={r.signals.momentum.confidence}
          colorHint={r.signals.momentum.trend === "overbought" ? "red" : r.signals.momentum.trend === "oversold" ? "green" : "yellow"}
          details={`RSI ${r.signals.momentum.rsi.toFixed(1)} · ${r.signals.momentum.priceChange24h >= 0 ? "+" : ""}${r.signals.momentum.priceChange24h.toFixed(2)}%`} />
        <SignalCard label="Sentiment" icon={Waves}
          value={r.signals.sentiment.fearGreedLabel} confidence={r.signals.sentiment.confidence}
          colorHint={r.signals.sentiment.fearGreedIndex >= 60 ? "green" : r.signals.sentiment.fearGreedIndex <= 30 ? "red" : "yellow"}
          details={`F&G ${r.signals.sentiment.fearGreedIndex} · ${r.signals.sentiment.shift}`} />
        <SignalCard label="Whales" icon={TrendingUp}
          value={r.signals.whales.direction} confidence={r.signals.whales.confidence}
          colorHint={r.signals.whales.direction === "accumulation" ? "green" : r.signals.whales.direction === "distribution" ? "red" : "yellow"}
          details={`${r.signals.whales.volumeAnomaly.toFixed(2)}x vol · ${r.signals.whales.netFlow}${r.signals.whales.alert ? " ⚠" : ""}`} />
        <SignalCard label="News" icon={Newspaper}
          value={r.signals.news.sentiment} confidence={r.signals.news.confidence}
          colorHint={r.signals.news.sentiment === "positive" ? "green" : r.signals.news.sentiment === "negative" ? "red" : "yellow"}
          details={r.signals.news.headlines[0] ?? "No headlines"} />
      </div>

      {/* Deep analysis CTA */}
      {!state.deepResult && !state.deepLoading && (
        <motion.button onClick={onStartDeep} whileTap={{ scale: 0.98 }} transition={spring}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-dashed border-[var(--border-bright)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] transition-all group">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] text-left">Run Deep Analysis</p>
            <p className="text-xs text-[var(--text-muted)]">7 AI agents · ~30s</p>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all" />
        </motion.button>
      )}
      {state.deepLoading && (
        <div className="px-4 py-3 rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-soft)]">
          <p className="text-xs font-medium text-[var(--text-primary)] mb-2">Agents debating…</p>
          <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
            <motion.div className="h-full bg-[var(--accent)] rounded-full"
              animate={{ width: `${state.deepProgress}%` }} transition={spring} />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Deep Results Panel ───────────────────────────────────────────────────────

const ANALYST_META: Record<string, { label: string; color: string; emoji: string }> = {
  market:    { label: "Market Analyst",    color: C.info,    emoji: "📊" },
  sentiment: { label: "Sentiment Analyst", color: C.accent,  emoji: "🧠" },
  news:      { label: "News Analyst",      color: C.warning, emoji: "📰" },
  onchain:   { label: "On-chain Analyst",  color: C.success, emoji: "⛓️" },
};

interface DeepResultsPanelProps {
  state: CopilotState;
}

export function DeepResultsPanel({ state }: DeepResultsPanelProps) {
  const [openAnalyst, setOpenAnalyst] = useState<number | null>(null);
  const [openDebate, setOpenDebate] = useState(false);

  if (!state.deepResult && !state.deepLoading && !state.deepError) {
    return (
      <EmptyState
        icon={Brain}
        title="Deep analysis will appear here"
        description="Run a quick check first, then launch deep analysis — seven agents debate bull vs bear and return a full thesis."
        hint="Adds entry/exit, risk levels & a written verdict"
        className="h-64 justify-center"
      />
    );
  }

  if (state.deepLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 flex items-center justify-center">
          <span className="text-2xl animate-pulse">⚔️</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Bull vs Bear agents debating…</p>
          <p className="text-xs text-[var(--text-muted)]">Analyzing market conditions across 7 agents</p>
        </div>
        <div className="w-48 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <motion.div className="h-full bg-[var(--accent)] rounded-full"
            animate={{ width: `${state.deepProgress}%` }} transition={spring} />
        </div>
      </div>
    );
  }

  if (state.deepError) {
    return <ErrorState message={state.deepError} className="h-64 justify-center" />;
  }

  const result = state.deepResult!;
  const actionColor = result.action === "BUY" ? C.success : result.action === "SELL" ? C.danger : C.warning;
  const actionVariant = (result.action === "BUY" ? "green" : result.action === "SELL" ? "red" : "yellow") as "green" | "red" | "yellow";
  const convictionVariant = (result.conviction === "strong" ? "green" : result.conviction === "moderate" ? "yellow" : "gray") as "green" | "yellow" | "gray";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="space-y-3">

      {/* ── Final verdict ── */}
      <div className="p-4 rounded-2xl border relative overflow-hidden"
        style={{ background: `color-mix(in srgb, ${actionColor} 8%, transparent)`, borderColor: `color-mix(in srgb, ${actionColor} 30%, transparent)` }}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Final Verdict · {state.symbol}</p>
            <p className="text-4xl font-semibold tracking-tight" style={{ color: actionColor }}>
              {result.action}
            </p>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <Badge variant={actionVariant}>{(result.confidence * 100).toFixed(0)}% conf</Badge>
            <Badge variant={convictionVariant}>{result.conviction}</Badge>
          </div>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">{result.reasoning}</p>

        {/* Entry / Exit */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white/5 rounded-xl p-2.5">
            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Entry</p>
            <p className="text-xs font-semibold text-[var(--text-primary)] capitalize">{result.entryStrategy?.method ?? "—"}</p>
            {result.entryStrategy?.targetPrice && (
              <p className="text-[10px] text-[var(--text-secondary)] tabular">${result.entryStrategy.targetPrice.toLocaleString()}</p>
            )}
          </div>
          <div className="bg-white/5 rounded-xl p-2.5">
            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Exit</p>
            {result.exitStrategy?.targetPrice && <p className="text-xs text-[var(--success)] tabular">TP ${result.exitStrategy.targetPrice.toLocaleString()}</p>}
            {result.exitStrategy?.stopLoss && <p className="text-[10px] text-[var(--danger)] tabular">SL ${result.exitStrategy.stopLoss.toLocaleString()}</p>}
          </div>
        </div>

        {/* Risk stats */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: "Stop",     value: result.risk?.stopLossPrice   != null ? `$${result.risk.stopLossPrice.toLocaleString()}`   : "—" },
            { label: "Target",   value: result.risk?.takeProfitPrice != null ? `$${result.risk.takeProfitPrice.toLocaleString()}` : "—" },
            { label: "R:R",      value: result.risk?.riskRewardRatio != null ? `${result.risk.riskRewardRatio.toFixed(1)}x`       : "—" },
            { label: "Size",     value: result.risk?.suggestedPositionPct != null ? `${result.risk.suggestedPositionPct}%`        : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-[8px] text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
              <p className="text-[10px] font-bold text-[var(--text-primary)] tabular mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {result.risk?.warnings?.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {result.risk.warnings.map((w, i) => (
              <p key={i} className="text-[10px] text-[var(--warning)] flex gap-1"><span>⚠</span>{w}</p>
            ))}
          </div>
        )}
      </div>

      {/* ── Analyst reports ── */}
      {result.analystReports?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">
            Analyst Reports ({result.analystReports.length})
          </p>
          {result.analystReports.map((r, i) => {
            const meta = ANALYST_META[r.analyst] ?? { label: r.analyst, color: C.accent, emoji: "🤖" };
            const isOpen = openAnalyst === i;
            const sigVariant = (r.signal === "bullish" ? "green" : r.signal === "bearish" ? "red" : "yellow") as "green" | "red" | "yellow";

            return (
              <div key={i} className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-elev)]">
                <button onClick={() => setOpenAnalyst(isOpen ? null : i)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.04] transition-colors text-left">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                    style={{ background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${meta.color} 22%, transparent)` }}>
                    {meta.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{meta.label}</span>
                      <Badge variant={sigVariant}>{r.signal}</Badge>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                      {r.keyFindings?.[0] ?? r.reasoning?.slice(0, 70) ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-bold tabular" style={{ color: meta.color }}>{(r.confidence * 100).toFixed(0)}%</span>
                    <span className="text-[var(--text-muted)] text-[10px]">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                      <div className="px-3 pb-3 pt-3 border-t border-[var(--border)] space-y-3">
                        <div>
                          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Reasoning</p>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{r.reasoning}</p>
                        </div>
                        {r.keyFindings?.length > 0 && (
                          <div>
                            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Key Findings</p>
                            <ul className="space-y-1">
                              {r.keyFindings.map((f, fi) => (
                                <li key={fi} className="flex gap-1.5 text-[10px] text-[var(--text-secondary)]">
                                  <span style={{ color: meta.color }} className="flex-shrink-0">▸</span>{f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Object.keys(r.metrics ?? {}).length > 0 && (
                          <div>
                            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Metrics</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {Object.entries(r.metrics).map(([k, v]) => (
                                <div key={k} className="bg-white/[0.04] rounded-lg px-2.5 py-1.5">
                                  <p className="text-[8px] text-[var(--text-muted)] uppercase">{k.replace(/_/g, " ")}</p>
                                  <p className="text-[10px] font-semibold text-[var(--text-primary)] tabular">{String(v)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Debate ── */}
      {result.debate?.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-elev)]">
          <button onClick={() => setOpenDebate(!openDebate)}
            className="w-full flex items-center justify-between p-3 hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚔️</span>
              <span className="text-xs font-semibold text-[var(--text-primary)]">Bull vs Bear Debate</span>
              <Badge variant="gray">{result.debate.length} msgs</Badge>
            </div>
            <span className="text-[var(--text-muted)] text-[10px]">{openDebate ? "▲" : "▼"}</span>
          </button>
          <AnimatePresence>
            {openDebate && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                <div className="px-3 pb-3 pt-3 border-t border-[var(--border)] space-y-2.5">
                  {result.debate.map((msg, i) => {
                    const isBull = msg.speaker === "bull";
                    const isFacil = msg.speaker === "facilitator";
                    const sc = isFacil ? C.accent : isBull ? C.success : C.danger;
                    const slabel = isFacil ? "🧑‍⚖️ Facilitator" : isBull ? "🐂 Bull" : "🐻 Bear";
                    return (
                      <div key={i} className={`flex gap-2 ${isBull ? "" : isFacil ? "justify-center" : "flex-row-reverse"}`}>
                        {!isFacil && (
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0 mt-0.5"
                            style={{ background: `color-mix(in srgb, ${sc} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${sc} 22%, transparent)` }}>
                            {isBull ? "🐂" : "🐻"}
                          </div>
                        )}
                        <div className={`max-w-[85%] ${isFacil ? "w-full" : ""}`}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sc }}>{slabel}</span>
                            {msg.round > 0 && <span className="text-[8px] text-[var(--text-muted)]">R{msg.round}</span>}
                          </div>
                          <div className="rounded-xl p-2.5 text-[11px] text-[var(--text-secondary)] leading-relaxed"
                            style={{ background: `color-mix(in srgb, ${sc} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${sc} 16%, transparent)` }}>
                            {msg.argument}
                          </div>
                          {msg.keyPoints?.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {msg.keyPoints.map((p, pi) => (
                                <li key={pi} className="text-[9px] text-[var(--text-muted)] flex gap-1">
                                  <span style={{ color: sc }}>·</span>{p}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Alternatives */}
      {result.alternatives?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Alternatives</CardTitle></CardHeader>
          <div className="space-y-1.5">
            {result.alternatives.map((alt, i) => (
              <div key={i} className="flex gap-2 p-2.5 rounded-xl bg-white/[0.04]">
                <Badge variant="gray">{alt.action}</Badge>
                <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">{alt.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </motion.div>
  );
}
