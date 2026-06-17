"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, ArrowRight, Zap, Brain, Shield, TrendingUp } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Quick Signals",
    desc: "4-signal AI analysis in under 3 seconds. Momentum, sentiment, whales, and news — all in one hit.",
    color: "#00ff88",
  },
  {
    icon: Brain,
    title: "Deep Analysis",
    desc: "7 AI agents debate your trade in real-time. Bull vs Bear. Full thesis. No cap.",
    color: "#8b5cf6",
  },
  {
    icon: TrendingUp,
    title: "Live Charts",
    desc: "30-day OHLCV with RSI, MACD, and Bollinger Bands. See the vibes before you trade.",
    color: "#3b82f6",
  },
  {
    icon: Shield,
    title: "Risk Engine",
    desc: "ATR-based position sizing, stop-loss, and take-profit levels. Protect your bag.",
    color: "#f97316",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen grid-bg relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#8b5cf6]/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[300px] bg-[#00ff88]/5 rounded-full blur-[80px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-24 pb-20">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          {/* Logo mark */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#00ff88] flex items-center justify-center shadow-lg shadow-purple-900/40">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tight text-[#f0f0ff]">SIGNAL</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight mb-6 leading-[1.05]">
            <span className="text-[#f0f0ff]">Trade smarter</span>
            <br />
            <span className="gradient-text">not harder</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#8888aa] max-w-2xl mx-auto leading-relaxed mb-10">
            AI-powered crypto signals that actually slap. Multi-agent analysis,
            real-time sentiment, and whale tracking — all in one place.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/copilot"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] text-white text-base font-bold hover:opacity-90 transition-opacity shadow-lg shadow-purple-900/40"
            >
              <Zap className="w-4 h-4" />
              Get Signals
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-white/5 border border-[#1e1e2e] text-[#f0f0ff] text-base font-medium hover:bg-white/10 hover:border-[#2a2a3e] transition-all"
            >
              View Dashboard
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-14">
            {[
              { value: "7", label: "AI Agents" },
              { value: "4", label: "Signal Types" },
              { value: "<3s", label: "Quick Check" },
              { value: "7 chains", label: "Multi-chain" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-black text-[#f0f0ff]">{value}</p>
                <p className="text-xs text-[#44445a] uppercase tracking-wider mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Features grid */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {features.map(({ icon: Icon, title, desc, color }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i + 0.3 }}
              className="card-glow p-6 group hover:border-[#2a2a3e] transition-all"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                style={{ background: `${color}15`, border: `1px solid ${color}25` }}
              >
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <h3 className="text-base font-bold text-[#f0f0ff] mb-2">{title}</h3>
              <p className="text-sm text-[#8888aa] leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA bottom */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center mt-16"
        >
          <p className="text-[#44445a] text-sm">
            Powered by Claude AI • Multi-agent intelligence • Built different
          </p>
        </motion.div>
      </div>
    </main>
  );
}
