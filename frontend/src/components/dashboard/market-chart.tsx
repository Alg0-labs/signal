"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  symbolToPair,
  fetchKlines,
  fetch24hStats,
  openKlineStream,
  INTERVALS,
  type Interval,
  type Stats24h,
} from "@/lib/binance";
import { formatPrice, formatPercent, formatMarketCap } from "@/lib/utils";

const GREEN = "#00ff88";
const RED = "#ff4d6d";

type ChartType = "candle" | "line";

interface MarketChartProps {
  symbol: string;
  /** Fired when the user clicks a candle — passes the candle time in ms. */
  onCandleClick?: (timeMs: number) => void;
  /** Fired when the user marks a range (two clicks) — passes [from, to] in ms. */
  onRangeSelect?: (fromMs: number, toMs: number) => void;
}

export function MarketChart({ symbol, onCandleClick, onRangeSelect }: MarketChartProps) {
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeHint, setRangeHint] = useState<string | null>(null);
  const rangeModeRef = useRef(false);
  const pendingStartRef = useRef<number | null>(null);
  const onRangeSelectRef = useRef(onRangeSelect);
  onRangeSelectRef.current = onRangeSelect;
  rangeModeRef.current = rangeMode;
  const pair = symbolToPair(symbol);
  const [interval, setInterval] = useState<Interval>("1h");
  const [type, setType] = useState<ChartType>("candle");
  const [stats, setStats] = useState<Stats24h | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest click handler in a ref so the chart effect needn't depend on it.
  const onClickRef = useRef(onCandleClick);
  onClickRef.current = onCandleClick;

  // Build / rebuild the chart whenever symbol, interval, or type changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let chart: IChartApi | null = null;
    let priceSeries: ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null = null;
    let volumeSeries: ISeriesApi<"Histogram"> | null = null;
    let closeStream: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;

    setError(false);
    setConnected(false);

    chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8888aa",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(30,30,46,0.5)" },
        horzLines: { color: "rgba(30,30,46,0.5)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#44445a", labelBackgroundColor: "#8b5cf6" },
        horzLine: { color: "#44445a", labelBackgroundColor: "#8b5cf6" },
      },
      rightPriceScale: { borderColor: "#1e1e2e" },
      timeScale: { borderColor: "#1e1e2e", timeVisible: true, secondsVisible: false },
    });

    if (type === "candle") {
      priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: GREEN,
        downColor: RED,
        borderVisible: false,
        wickUpColor: GREEN,
        wickDownColor: RED,
      });
    } else {
      priceSeries = chart.addSeries(AreaSeries, {
        lineColor: GREEN,
        topColor: "rgba(0,255,136,0.25)",
        bottomColor: "rgba(0,255,136,0)",
        lineWidth: 2,
      });
    }

    // Click a candle -> explain it; in range mode, two clicks mark a span to analyse.
    chart.subscribeClick((param) => {
      if (param.time == null) return;
      const t = Number(param.time) * 1000;
      if (rangeModeRef.current) {
        if (pendingStartRef.current == null) {
          pendingStartRef.current = t;
          setRangeHint("Now click the end candle…");
        } else {
          const from = Math.min(pendingStartRef.current, t);
          const to = Math.max(pendingStartRef.current, t);
          pendingStartRef.current = null;
          setRangeMode(false);
          setRangeHint(null);
          onRangeSelectRef.current?.(from, to);
        }
      } else {
        onClickRef.current?.(t);
      }
    });

    volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // Seed with history, then stream live updates.
    fetchKlines(pair, interval, 300)
      .then((candles) => {
        if (disposed || !priceSeries || !volumeSeries) return;

        if (type === "candle") {
          (priceSeries as ISeriesApi<"Candlestick">).setData(
            candles.map((c) => ({
              time: c.time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          );
        } else {
          (priceSeries as ISeriesApi<"Area">).setData(
            candles.map((c) => ({ time: c.time, value: c.close }))
          );
        }

        volumeSeries.setData(
          candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(0,255,136,0.4)" : "rgba(255,77,109,0.4)",
          }))
        );

        chart?.timeScale().fitContent();

        const lastClose = candles[candles.length - 1]?.close ?? null;
        setLive(lastClose);

        // Real-time updates — Binance pushes the forming candle ~1x/sec.
        closeStream = openKlineStream(pair, interval, (c) => {
          if (disposed || !priceSeries || !volumeSeries) return;
          setConnected(true);
          setLive(c.close);

          if (type === "candle") {
            (priceSeries as ISeriesApi<"Candlestick">).update({
              time: c.time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            });
          } else {
            (priceSeries as ISeriesApi<"Area">).update({ time: c.time, value: c.close });
          }

          volumeSeries.update({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(0,255,136,0.4)" : "rgba(255,77,109,0.4)",
          });
        });
      })
      .catch(() => {
        if (!disposed) setError(true);
      });

    // Responsive width (autoSize handles most, ResizeObserver covers layout shifts).
    resizeObserver = new ResizeObserver(() => chart?.timeScale().fitContent());
    resizeObserver.observe(el);

    return () => {
      disposed = true;
      closeStream?.();
      resizeObserver?.disconnect();
      chart?.remove();
    };
  }, [pair, interval, type]);

  // 24h stats strip — poll REST every 20s.
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch24hStats(pair)
        .then((s) => active && setStats(s))
        .catch(() => {});
    load();
    const id = window.setInterval(load, 20_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [pair]);

  const change = stats?.priceChangePercent ?? 0;
  const isUp = change >= 0;
  const price = live ?? stats?.lastPrice ?? 0;

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? "bg-[#00ff88] animate-pulse" : "bg-[#44445a]"
              }`}
            />
            <h3 className="text-base font-bold text-[#f0f0ff]">{symbol} / USDT</h3>
          </div>
          <Badge variant={isUp ? "green" : "red"}>{formatPercent(change)}</Badge>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-lg font-bold text-[#f0f0ff] tabular-nums">{formatPrice(price)}</p>
          {/* Chart type toggle */}
          <div className="flex bg-white/5 rounded-lg p-0.5">
            {(["candle", "line"] as ChartType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded-md transition ${
                  type === t ? "bg-[#8b5cf6] text-white" : "text-[#8888aa] hover:text-[#f0f0ff]"
                }`}
              >
                {t === "candle" ? "Candles" : "Line"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interval selector + Mark-range */}
      <div className="flex items-center gap-1 mb-3">
        {INTERVALS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setInterval(value)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition ${
              interval === value
                ? "bg-[#00ff88]/15 text-[#00ff88]"
                : "text-[#44445a] hover:text-[#8888aa]"
            }`}
          >
            {label}
          </button>
        ))}
        {onRangeSelect && (
          <button
            onClick={() => {
              const next = !rangeMode;
              setRangeMode(next);
              pendingStartRef.current = null;
              setRangeHint(next ? "Click the start candle…" : null);
            }}
            className={`ml-auto px-2.5 py-1 text-[10px] font-bold rounded-md transition ${
              rangeMode ? "bg-[#8b5cf6] text-white" : "text-[#8888aa] hover:text-[#8b5cf6] bg-white/5"
            }`}
          >
            {rangeMode ? "Selecting…" : "⛶ Mark range"}
          </button>
        )}
      </div>
      {rangeHint && <p className="text-[10px] text-[#8b5cf6] mb-2 -mt-1">{rangeHint}</p>}

      {/* Chart */}
      <div className="relative w-full" style={{ height: 320 }}>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[#ff4d6d]">
            Failed to load market data for {pair}
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* 24h stat row */}
      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#1e1e2e]">
        {[
          { label: "24h High", value: formatPrice(stats?.high ?? 0) },
          { label: "24h Low", value: formatPrice(stats?.low ?? 0) },
          { label: "24h Vol", value: formatMarketCap(stats?.quoteVolume ?? 0) },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-[10px] text-[#44445a] uppercase tracking-wider">{label}</p>
            <p className="text-xs font-semibold text-[#f0f0ff] font-mono mt-0.5">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
