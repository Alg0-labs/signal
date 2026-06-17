"use client";

import { useState } from "react";
import { Navbar } from "@/components/ui/navbar";
import { PriceChart } from "@/components/copilot/price-chart";
import {
  InputPanel,
  QuickResultsPanel,
  DeepResultsPanel,
  defaultCopilotState,
  type CopilotState,
} from "@/components/copilot/quick-check";
import { signalApi, type QuickCheckResult } from "@/lib/api";

const CHART_SYMBOLS = ["ETH", "SOL", "BNB", "AVAX", "MATIC"];

export default function CopilotPage() {
  const [state, setState] = useState<CopilotState>(defaultCopilotState);
  const [chartSymbol, setChartSymbol] = useState("ETH");

  const patch = (p: Partial<CopilotState>) => setState((s) => ({ ...s, ...p }));

  const handleQuickResult = (r: QuickCheckResult) => {
    patch({ quickResult: r, deepResult: null, deepLoading: false, deepProgress: 0, deepError: null });
  };

  const handleStartDeep = async () => {
    if (!state.quickResult?.sessionId) return;
    patch({ deepLoading: true, deepProgress: 5, deepError: null, deepResult: null });

    try {
      await signalApi.startDeepAnalysis(state.quickResult.sessionId);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to start";
      patch({ deepLoading: false, deepError: msg });
      return;
    }

    const sessionId = state.quickResult.sessionId;
    let attempts = 0;
    const interval = setInterval(async () => {
      try {
        const { data } = await signalApi.getAnalysisStatus(sessionId);
        patch({ deepProgress: Math.min((attempts / 20) * 90, 90) });

        if (data.status === "complete") {
          clearInterval(interval);
          const report = await signalApi.getAnalysisReport(sessionId);
          const deep = (report.data as unknown as { deepAnalysis: CopilotState["deepResult"] }).deepAnalysis;
          patch({ deepResult: deep, deepLoading: false, deepProgress: 100 });
        }
        if (data.status === "error") {
          clearInterval(interval);
          patch({ deepLoading: false, deepError: "Server-side analysis failed" });
        }
        if (++attempts > 60) {
          clearInterval(interval);
          patch({ deepLoading: false, deepError: "Timed out after 2 minutes" });
        }
      } catch {
        clearInterval(interval);
        patch({ deepLoading: false, deepError: "Lost connection to backend" });
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen grid-bg">
      <Navbar />
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">

        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-xl font-black text-[#f0f0ff]">Trading Copilot</h1>
          <p className="text-[#8888aa] text-xs mt-0.5">
            Quick signals in ~3s · Deep multi-agent analysis in ~30s
          </p>
        </div>

        {/* 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-4 items-start">

          {/* ── Col 1: Input ── */}
          <div className="lg:sticky lg:top-20">
            <InputPanel
              state={state}
              onChange={patch}
              onResult={handleQuickResult}
            />

            {/* Chart symbol picker below inputs */}
            <div className="mt-4">
              <p className="text-[10px] font-semibold text-[#44445a] uppercase tracking-wider mb-2 px-1">Chart</p>
              <div className="flex flex-wrap gap-1.5">
                {CHART_SYMBOLS.map((s) => (
                  <button key={s} onClick={() => setChartSymbol(s)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      chartSymbol === s
                        ? "bg-[#8b5cf6]/20 border-[#8b5cf6]/40 text-[#8b5cf6]"
                        : "bg-white/5 border-[#1e1e2e] text-[#8888aa] hover:border-[#2a2a3e] hover:text-[#f0f0ff]"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <PriceChart symbol={chartSymbol} />
              </div>
            </div>
          </div>

          {/* ── Col 2: Quick results ── */}
          <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-120px)]">
            <p className="text-[10px] font-semibold text-[#44445a] uppercase tracking-wider mb-3 px-1">Quick Analysis</p>
            <QuickResultsPanel state={state} onStartDeep={handleStartDeep} />
          </div>

          {/* ── Col 3: Deep results ── */}
          <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-120px)]">
            <p className="text-[10px] font-semibold text-[#44445a] uppercase tracking-wider mb-3 px-1">Deep Analysis</p>
            <DeepResultsPanel state={state} />
          </div>

        </div>
      </div>
    </div>
  );
}
