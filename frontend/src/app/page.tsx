"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity, ArrowRight, Zap, Brain, Shield, TrendingUp,
  MessageSquare, ExternalLink, Sparkles,
} from "lucide-react";
import { FadeIn, Stagger, StaggerItem, AnimatedNumber } from "@/components/ui/motion";
import { ChartAnalystDemo } from "@/components/landing/chart-analyst-demo";
import { CoinField } from "@/components/landing/coin-field";

const MCP_URL = "https://crypto-portfolio-mcp.vercel.app/";

const features = [
  {
    icon: Zap,
    title: "Quick Signals",
    desc: "A four-factor AI read — momentum, sentiment, whale flow, and news — in under three seconds. Know where a trade stands before you commit.",
    color: "var(--success)",
  },
  {
    icon: Brain,
    title: "Deep Analysis",
    desc: "Seven specialist agents debate bull versus bear, then deliver a written thesis with entry, exit, and position-level conviction.",
    color: "var(--accent)",
  },
  {
    icon: TrendingUp,
    title: "Live Charts",
    desc: "30-day OHLCV with RSI, MACD, and Bollinger Bands, streaming in real time across seven chains.",
    color: "var(--info)",
  },
  {
    icon: Shield,
    title: "Risk Engine",
    desc: "ATR-based position sizing with clear stop-loss and take-profit levels, so every entry has a defined downside.",
    color: "var(--warning)",
  },
];

const stats: { value: number; suffix?: string; prefix?: string; label: string }[] = [
  { value: 7, label: "AI Agents" },
  { value: 4, label: "Signal Types" },
  { value: 3, prefix: "<", suffix: "s", label: "Quick Check" },
  { value: 7, label: "Chains" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen grid-bg relative overflow-hidden">
      {/* Soft ambient light — slowly drifting, depth not neon */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/2 w-[640px] h-[420px] bg-[var(--accent)]/[0.07] rounded-full blur-[120px]"
          animate={{ x: ["-52%", "-48%", "-52%"], y: [0, 24, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 left-1/4 w-[420px] h-[320px] bg-[var(--success)]/[0.04] rounded-full blur-[100px]"
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Floating 3D crypto coins */}
      <CoinField />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-24 pb-20">
        {/* Hero */}
        <FadeIn className="text-center mb-20" y={24}>
          {/* Logo mark */}
          <div className="flex items-center justify-center gap-3 mb-7">
            <motion.div
              className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-[var(--shadow-accent)]"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Activity className="w-6 h-6 text-white" />
            </motion.div>
            <span className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">SIGNAL</span>
          </div>

          {/* Powered-by announcement pill */}
          <a
            href={MCP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mb-8 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-bright)] transition-all group"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            Powered by <span className="font-semibold text-[var(--text-primary)]">crypto-portfolio-mcp</span>
            <ExternalLink className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </a>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight mb-6 leading-[1.05]">
            <span className="text-[var(--text-primary)]">Trade with conviction,</span>
            <br />
            <span className="gradient-text">not guesswork</span>
          </h1>

          <p className="text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed mb-10">
            SIGNAL turns real-time market data into clear, explainable trading decisions —
            multi-agent AI analysis, a conversational chart analyst, and disciplined risk
            management, in one workspace.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/copilot"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[var(--radius-control)] bg-[var(--accent)] text-white text-base font-semibold hover:bg-[var(--accent-strong)] active:scale-[0.97] transition-all duration-200 ease-[var(--ease-spring)] shadow-[var(--shadow-accent)]"
            >
              <Zap className="w-4 h-4" />
              Start Analyzing
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[var(--radius-control)] bg-white/[0.04] border border-[var(--border)] text-[var(--text-primary)] text-base font-medium hover:bg-white/[0.08] hover:border-[var(--border-bright)] active:scale-[0.97] transition-all duration-200 ease-[var(--ease-spring)]"
            >
              Explore the Dashboard
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-14">
            {stats.map(({ value, label, prefix, suffix }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-semibold text-[var(--text-primary)] tabular">
                  <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
                </p>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Featured: Talk to the Chart */}
        <FadeIn delay={0.1} className="mb-4">
          <Link
            href="/dashboard"
            className="block card-glow p-6 sm:p-8 group relative overflow-hidden"
          >
            <div className="absolute -top-16 -right-10 w-56 h-56 bg-[var(--accent)]/[0.08] rounded-full blur-[80px] pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 mb-3">
                  <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[var(--border-bright)] flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
                  </span>
                  <span className="tag tag-purple">New · RAG analyst</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-2">
                  Talk to the chart
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-lg">
                  Click any candle or mark a range. SIGNAL reads the chart and candlestick
                  <span className="text-[var(--text-primary)]"> formations</span> as they form, shows you
                  <span className="text-[var(--text-primary)]"> every time the same setup appeared before</span> and
                  how it resolved, and pulls the news from that
                  <span className="text-[var(--text-primary)]"> exact moment in time</span> — so you know not
                  just what happened, but what usually happens next.
                </p>
                <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-[var(--accent)] group-hover:gap-2.5 transition-all">
                  Try it on the dashboard <ArrowRight className="w-4 h-4" />
                </span>
              </div>

              {/* Animated select-candle → RAG → analysis demo */}
              <ChartAnalystDemo />
            </div>
          </Link>
        </FadeIn>

        {/* Features grid */}
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-4" gap={0.08}>
          {features.map(({ icon: Icon, title, desc, color }) => (
            <StaggerItem key={title}>
              <div className="card-glow p-6 group h-full">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform duration-200 ease-[var(--ease-spring)] group-hover:scale-110"
                  style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 26%, transparent)` }}
                >
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Powered-by attribution */}
        <FadeIn className="mt-16 text-center" delay={0.15}>
          <a
            href={MCP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--radius-control)] bg-white/[0.03] border border-[var(--border)] hover:border-[var(--border-bright)] hover:bg-white/[0.05] transition-all group"
          >
            <span className="text-sm text-[var(--text-secondary)]">
              Market &amp; multi-chain portfolio data powered by
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">crypto-portfolio-mcp</span>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all" />
          </a>
          <p className="text-[var(--text-muted)] text-xs mt-6">
            Made with ❤️ by Vibhu
          </p>
        </FadeIn>
      </div>
    </main>
  );
}
