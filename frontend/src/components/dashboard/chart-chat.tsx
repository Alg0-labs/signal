"use client";

import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { signalApi, type Citation, type Technicals, type Analogs, type Pattern, type OrderFlow } from "@/lib/api";
import { AnalysisCard } from "@/components/dashboard/analysis-card";
import { Markdown } from "@/components/ui/markdown";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  technicals?: Technicals | null;
  analogs?: Analogs | null;
  pattern?: Pattern | null;
  orderFlow?: OrderFlow | null;
}

interface ChartChatProps {
  symbol: string;
  /** Set when a candle is clicked: {timeMs, seq}. seq forces re-trigger on repeat clicks. */
  focus?: { timeMs: number; seq: number } | null;
  /** Set when a range is marked: {from, to, seq}. Triggers pattern analysis. */
  selection?: { from: number; to: number; seq: number } | null;
}

const DAY = 86_400_000;

export function ChartChat({ symbol, focus, selection }: ChartChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ragWarn, setRagWarn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when the active symbol changes.
  useEffect(() => {
    setMessages([]);
    setRagWarn(false);
  }, [symbol]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(
    text: string,
    range?: { from?: number; to?: number },
    sel?: { from: number; to: number }
  ) {
    const clean = text.trim();
    if (!clean || loading) return;

    const next: ChatMsg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const history = next.map((m) => ({ role: m.role, content: m.content }));
      const { data } = await signalApi.chartChat(symbol, history, range, sel);
      setRagWarn(!data.ragAvailable);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply, citations: data.citations, technicals: data.technicals, analogs: data.analogs, pattern: data.pattern, orderFlow: data.orderFlow },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "That took too long — likely the free-tier news rate limit (3/min). Wait a few seconds and ask again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Candle click -> ask about that moment, scoped to a window around it.
  useEffect(() => {
    if (!focus) return;
    const date = new Date(focus.timeMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    send(`What happened around ${date}? Explain this price move.`, { from: focus.timeMs - 2 * DAY, to: focus.timeMs + DAY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.seq]);

  // Range marked -> ask what pattern it is and how it historically resolved.
  useEffect(() => {
    if (!selection) return;
    const f = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    send(
      `I marked the range ${f(selection.from)}–${f(selection.to)}. What chart pattern does this look like, and what has historically followed similar setups?`,
      undefined,
      { from: selection.from, to: selection.to }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.seq]);

  const suggestions = [
    "What's the trend right now?",
    "Is it overbought or oversold?",
    "Why did it move this week?",
  ];

  return (
    <Card className="flex flex-col" style={{ height: 520 }}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#8b5cf6]" />
          <CardTitle>Talk to the {symbol} chart</CardTitle>
        </div>
        <span className="text-[10px] text-[#44445a] uppercase tracking-wider">RAG · live data</span>
      </CardHeader>

      {ragWarn && (
        <div className="mb-2 text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 rounded-md px-2 py-1">
          News retrieval not configured — answering from technicals only.
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3">
            <p className="text-xs text-[#44445a]">Ask about price action, or click any candle on the chart.</p>
            <div className="flex flex-col gap-1.5 w-full">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs text-[#8888aa] hover:text-[#00ff88] bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 ${
                m.role === "user"
                  ? "bg-[#8b5cf6]/20 text-[#f0f0ff] text-xs leading-relaxed whitespace-pre-wrap"
                  : "bg-white/5 text-[#c8c8e0]"
              }`}
            >
              {m.role === "assistant" && m.technicals && (
                <AnalysisCard ta={m.technicals} analogs={m.analogs ?? null} pattern={m.pattern ?? null} orderFlow={m.orderFlow ?? null} />
              )}
              {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#1e1e2e] flex flex-col gap-1">
                  {m.citations.map((c) => (
                    <a
                      key={c.index}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[10px] text-[#00ff88]/80 hover:text-[#00ff88] transition"
                    >
                      <span className="font-mono">[{c.index}]</span>
                      <span className="truncate">{c.title}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-[#8888aa]">
              <Loader2 className="w-3 h-3 animate-spin" /> analysing…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${symbol}…`}
          className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-xs text-[#f0f0ff] placeholder:text-[#44445a] outline-none focus:ring-1 focus:ring-[#8b5cf6]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#8b5cf6] hover:bg-[#7c4ddb] disabled:opacity-40 rounded-lg p-2 transition"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </form>
    </Card>
  );
}
