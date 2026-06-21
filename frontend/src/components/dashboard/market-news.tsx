"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/states";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import type { MarketContext } from "@/lib/api";
import { ExternalLink, Newspaper } from "lucide-react";

interface MarketNewsProps {
  news?: MarketContext["relevantNews"];
  loading?: boolean;
}

export function MarketNews({ news, loading }: MarketNewsProps) {
  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
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
      {!news?.length ? (
        <div className="flex flex-col items-center text-center py-8">
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-[var(--border)] flex items-center justify-center mb-3">
            <Newspaper className="w-5 h-5 text-[var(--text-muted)]" />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">No recent news</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Headlines refresh automatically</p>
        </div>
      ) : (
        <Stagger className="space-y-2.5">
          {news.slice(0, 6).map((item, i) => (
            <StaggerItem key={i}>
              <a
                href={item.url || undefined}
                target={item.url ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] transition-colors cursor-pointer group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] leading-snug line-clamp-2">
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
                    {item.importance === "high" && <Badge variant="purple">hot</Badge>}
                    {item.source && (
                      <span className="text-[10px] text-[var(--text-muted)]">{item.source}</span>
                    )}
                  </div>
                </div>
                {item.url && (
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] flex-shrink-0 mt-0.5" />
                )}
              </a>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </Card>
  );
}
