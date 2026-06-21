"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { signalApi } from "@/lib/api";
import { formatPrice, formatPercent, formatMarketCap } from "@/lib/utils";

interface PriceChartProps {
  symbol: string;
}

export function PriceChart({ symbol }: PriceChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["chart", symbol],
    queryFn: () => signalApi.getChart(symbol),
    select: (r) => r.data,
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-52 bg-white/5 rounded-xl" />
      </Card>
    );
  }

  const chartData = data?.prices?.map(([ts, price]) => ({
    time: new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price,
  })) ?? [];

  const priceChange = data?.marketData?.priceChangePercent24h ?? 0;
  const isUp = priceChange >= 0;

  const minPrice = Math.min(...chartData.map((d) => d.price));
  const maxPrice = Math.max(...chartData.map((d) => d.price));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{symbol} / USD</CardTitle>
          <Badge variant={isUp ? "green" : "red"}>
            {formatPercent(priceChange)}
          </Badge>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
            {formatPrice(data?.marketData?.currentPrice ?? 0)}
          </p>
        </div>
      </CardHeader>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "24h High", value: formatPrice(data?.marketData?.high24h ?? 0) },
          { label: "24h Low", value: formatPrice(data?.marketData?.low24h ?? 0) },
          { label: "Market Cap", value: formatMarketCap(data?.marketData?.marketCap ?? 0) },
          { label: "Volume", value: formatMarketCap(data?.marketData?.volume24h ?? 0) },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
            <p className="text-xs font-semibold text-[var(--text-primary)] font-mono mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: 176 }}>
        <ResponsiveContainer width="100%" height={176}>
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isUp ? "#34d399" : "#fb6a82"} stopOpacity={0.25} />
                <stop offset="100%" stopColor={isUp ? "#34d399" : "#fb6a82"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fill: "#7a7f94", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minPrice * 0.995, maxPrice * 1.005]}
              tick={{ fill: "#7a7f94", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatPrice(v, 0)}
              width={60}
            />
            <Tooltip
              contentStyle={{
                background: "#111219",
                border: "1px solid #23252f",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ color: "#b4b8c9" }}
              itemStyle={{ color: isUp ? "#34d399" : "#fb6a82" }}
              formatter={(v: unknown) => [formatPrice(Number(v)), "Price"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={isUp ? "#34d399" : "#fb6a82"}
              strokeWidth={2}
              fill={`url(#grad-${symbol})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Indicators */}
      {data?.indicators && (
        <div className="flex gap-3 mt-3 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-muted)]">RSI</span>
            <span
              className={`text-xs font-bold font-mono ${
                data.indicators.rsi > 70
                  ? "text-[var(--danger)]"
                  : data.indicators.rsi < 30
                  ? "text-[var(--success)]"
                  : "text-[var(--warning)]"
              }`}
            >
              {data.indicators.rsi.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-muted)]">MACD</span>
            <span
              className={`text-xs font-bold font-mono ${
                data.indicators.macd.histogram >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
              }`}
            >
              {data.indicators.macd.histogram >= 0 ? "+" : ""}
              {data.indicators.macd.histogram.toFixed(4)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
