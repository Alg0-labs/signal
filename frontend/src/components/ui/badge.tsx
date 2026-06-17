"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "green" | "red" | "yellow" | "purple" | "blue" | "gray";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantMap: Record<BadgeVariant, string> = {
  green: "tag-green",
  red: "tag-red",
  yellow: "tag-yellow",
  purple: "tag-purple",
  blue: "tag-blue",
  gray: "bg-white/5 text-[#8888aa] border border-white/10",
};

export function Badge({ children, variant = "gray", className, dot }: BadgeProps) {
  return (
    <span className={cn("tag", variantMap[variant], className)}>
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full inline-block", {
            "bg-[#00ff88]": variant === "green",
            "bg-[#ff4d6d]": variant === "red",
            "bg-[#f59e0b]": variant === "yellow",
            "bg-[#8b5cf6]": variant === "purple",
            "bg-[#60a5fa]": variant === "blue",
            "bg-[#8888aa]": variant === "gray",
          })}
        />
      )}
      {children}
    </span>
  );
}
