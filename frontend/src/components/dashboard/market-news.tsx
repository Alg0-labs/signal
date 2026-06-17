"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MarketContext } from "@/lib/api";
import { ExternalLink } from "lucide-react";

interface MarketNewsProps {
  news?: MarketContext["relevantNews"];
  loading?: boolean;
}

export function MarketNews({ news, loading }: MarketNewsProps) {
  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market News</CardTitle>
      </CardHeader>
      <div className="space-y-2.5">
        {!news?.length ? (
          <p className="text-[#44445a] text-sm text-center py-4">No recent news</p>
        ) : (
          news.slice(0, 6).map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl bg-white/3 hover:bg-white/5 transition-colors cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#f0f0ff] leading-snug line-clamp-2 group-hover:text-white">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge
                    variant={
                      item.sentiment === "bullish"
                        ? "green"
                        : item.sentiment === "bearish"
                        ? "red"
                        : "yellow"
                    }
                  >
                    {item.sentiment}
                  </Badge>
                  {item.importance === "high" && (
                    <Badge variant="purple">hot</Badge>
                  )}
                  {item.source && (
                    <span className="text-[10px] text-[#44445a]">{item.source}</span>
                  )}
                </div>
              </div>
              {item.url && (
                <ExternalLink className="w-3.5 h-3.5 text-[#44445a] group-hover:text-[#8888aa] flex-shrink-0 mt-0.5" />
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
