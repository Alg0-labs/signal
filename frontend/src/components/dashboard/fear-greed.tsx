"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/states";
import { AnimatedNumber } from "@/components/ui/motion";
import type { MarketContext } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface FearGreedProps {
  data?: MarketContext["fearGreed"];
  loading?: boolean;
}

function getColor(value: number) {
  if (value >= 75) return { text: "#34d399", bg: "rgba(52,211,153,0.15)", label: "Extreme Greed" };
  if (value >= 55) return { text: "#8b7bf6", bg: "rgba(139,123,246,0.15)", label: "Greed" };
  if (value >= 45) return { text: "#fbbf24", bg: "rgba(251,191,36,0.15)", label: "Neutral" };
  if (value >= 25) return { text: "#fb923c", bg: "rgba(251,146,60,0.15)", label: "Fear" };
  return { text: "#fb6a82", bg: "rgba(251,106,130,0.15)", label: "Extreme Fear" };
}

export function FearGreedWidget({ data, loading }: FearGreedProps) {
  if (loading) {
    return (
      <Card>
        <Skeleton className="h-24" />
      </Card>
    );
  }

  const value = data?.value ?? 50;
  const color = getColor(value);
  const trend = data?.trend ?? "stable";

  const angle = (value / 100) * 180 - 90; // -90 to 90 degrees

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fear &amp; Greed</CardTitle>
        <Badge
          variant={trend === "rising" ? "green" : trend === "falling" ? "red" : "yellow"}
          dot
        >
          {trend === "rising" ? (
            <TrendingUp className="w-3 h-3" />
          ) : trend === "falling" ? (
            <TrendingDown className="w-3 h-3" />
          ) : (
            <Minus className="w-3 h-3" />
          )}
          {trend}
        </Badge>
      </CardHeader>

      <div className="flex items-center gap-6">
        {/* Gauge */}
        <div className="relative w-24 h-12 flex-shrink-0">
          <svg viewBox="0 0 100 50" className="w-full">
            {/* Background arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="var(--border)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Colored arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke={color.text}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(value / 100) * 125.66} 125.66`}
            />
            {/* Needle */}
            <line
              x1="50"
              y1="50"
              x2={50 + 32 * Math.cos(((angle - 90) * Math.PI) / 180)}
              y2={50 + 32 * Math.sin(((angle - 90) * Math.PI) / 180)}
              stroke="var(--text-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="50" cy="50" r="3" fill="var(--text-primary)" />
          </svg>
        </div>

        {/* Value */}
        <div>
          <div className="text-4xl font-semibold tabular" style={{ color: color.text }}>
            <AnimatedNumber value={value} />
          </div>
          <div className="text-sm font-medium mt-0.5" style={{ color: color.text }}>
            {color.label}
          </div>
          {data?.label && (
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">{data.label}</div>
          )}
        </div>
      </div>

      {/* History sparkline */}
      {data?.history && data.history.length > 0 && (
        <div className="mt-4 flex items-end gap-1 h-8">
          {data.history.slice(-14).map((h, i) => {
            const c = getColor(h.value);
            return (
              <div
                key={i}
                className="flex-1 rounded-sm min-h-[2px] transition-all"
                style={{
                  height: `${(h.value / 100) * 32}px`,
                  background: c.text,
                  opacity: 0.6,
                }}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
