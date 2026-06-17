import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(value: number | undefined | null, decimals = 2): string {
  if (value == null || isNaN(value)) return "$—";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: decimals })}`;
  if (value >= 1) return `$${value.toFixed(decimals)}`;
  return `$${value.toFixed(6)}`;
}

export function formatPercent(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatMarketCap(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return "$—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

export function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function confidenceLabel(c: number): string {
  if (c >= 0.8) return "Very High";
  if (c >= 0.6) return "High";
  if (c >= 0.4) return "Medium";
  return "Low";
}
