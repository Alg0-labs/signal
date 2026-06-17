"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/ui/navbar";
import { FearGreedWidget } from "@/components/dashboard/fear-greed";
import { MarketNews } from "@/components/dashboard/market-news";
import { MarketChart } from "@/components/dashboard/market-chart";
import { ChartChat } from "@/components/dashboard/chart-chat";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { signalApi } from "@/lib/api";
import { formatPercent } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

// Real-time charts via Binance public API (free, no key).
const TOP_ASSETS = [
  { symbol: "BTC", label: "BTC" },
  { symbol: "ETH", label: "ETH" },
  { symbol: "SOL", label: "SOL" },
  { symbol: "BNB", label: "BNB" },
];

export default function DashboardPage() {
  // Shared state for "Talk to the chart": which asset + which candle/range is in focus.
  const [chatSymbol, setChatSymbol] = useState("ETH");
  const [chatFocus, setChatFocus] = useState<{ timeMs: number; seq: number } | null>(null);
  const [chatSelection, setChatSelection] = useState<{ from: number; to: number; seq: number } | null>(null);

  const { data: market, isLoading: marketLoading } = useQuery({
    queryKey: ["market"],
    queryFn: () => signalApi.getMarket(),
    select: (r) => r.data,
    refetchInterval: 60 * 1000,
  });

  return (
    <div className="min-h-screen grid-bg">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-[#f0f0ff]">Market Dashboard</h1>
          <p className="text-[#8888aa] text-sm mt-1">Real-time market intelligence</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Charts */}
            {TOP_ASSETS.map(({ symbol }) => (
              <MarketChart
                key={symbol}
                symbol={symbol}
                onCandleClick={(timeMs) => {
                  setChatSymbol(symbol);
                  setChatFocus({ timeMs, seq: Date.now() });
                }}
                onRangeSelect={(from, to) => {
                  setChatSymbol(symbol);
                  setChatSelection({ from, to, seq: Date.now() });
                }}
              />
            ))}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <ChartChat symbol={chatSymbol} focus={chatFocus} selection={chatSelection} />

            <FearGreedWidget data={market?.fearGreed} loading={marketLoading} />

            {/* Portfolio impact */}
            {market?.portfolioImpact && market.portfolioImpact.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Impact (24h)</CardTitle>
                </CardHeader>
                <div className="space-y-2.5">
                  {market.portfolioImpact.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#f0f0ff]">{item.symbol}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.priceChange >= 0 ? "green" : "red"}>
                          {item.priceChange >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {formatPercent(item.priceChange)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <MarketNews news={market?.relevantNews} loading={marketLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
