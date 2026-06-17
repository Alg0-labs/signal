"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MarketContext } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface FearGreedProps {
  data?: MarketContext["fearGreed"];
  loading?: boolean;
}

function getColor(value: number) {
  if (value >= 75) return { text: "#00ff88", bg: "rgba(0,255,136,0.15)", label: "Extreme Greed" };
  if (value >= 55) return { text: "#8b5cf6", bg: "rgba(139,92,246,0.15)", label: "Greed" };
  if (value >= 45) return { text: "#f59e0b", bg: "rgba(245,158,11,0.15)", label: "Neutral" };
  if (value >= 25) return { text: "#f97316", bg: "rgba(249,115,22,0.15)", label: "Fear" };
  return { text: "#ff4d6d", bg: "rgba(255,77,109,0.15)", label: "Extreme Fear" };
}

export function FearGreedWidget({ data, loading }: FearGreedProps) {
  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="h-24 bg-white/5 rounded-xl" />
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
              stroke="#1e1e2e"
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
              style={{ filter: `drop-shadow(0 0 4px ${color.text})` }}
            />
            {/* Needle */}
            <line
              x1="50"
              y1="50"
              x2={50 + 32 * Math.cos(((angle - 90) * Math.PI) / 180)}
              y2={50 + 32 * Math.sin(((angle - 90) * Math.PI) / 180)}
              stroke="#f0f0ff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="50" cy="50" r="3" fill="#f0f0ff" />
          </svg>
        </div>

        {/* Value */}
        <div>
          <div
            className="text-4xl font-bold tabular-nums"
            style={{ color: color.text, textShadow: `0 0 20px ${color.text}60` }}
          >
            {value}
          </div>
          <div className="text-sm font-medium mt-0.5" style={{ color: color.text }}>
            {color.label}
          </div>
          {data?.label && (
            <div className="text-xs text-[#8888aa] mt-0.5">{data.label}</div>
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
