"use client";

import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  glow?: "green" | "purple" | "blue" | "none";
  onClick?: () => void;
}

export function Card({ children, className, style, glow = "none", onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        "card-glow p-5 relative overflow-hidden",
        glow === "green" && "glow-green",
        glow === "purple" && "glow-purple",
        glow === "blue" && "glow-blue",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-sm font-semibold text-[#8888aa] uppercase tracking-wider", className)}>
      {children}
    </h3>
  );
}
