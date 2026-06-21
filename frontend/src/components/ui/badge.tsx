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
  gray: "bg-white/5 text-[var(--text-secondary)] border border-white/10",
};

export function Badge({ children, variant = "gray", className, dot }: BadgeProps) {
  return (
    <span className={cn("tag", variantMap[variant], className)}>
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full inline-block", {
            "bg-[#34d399]": variant === "green",
            "bg-[#fb6a82]": variant === "red",
            "bg-[#fbbf24]": variant === "yellow",
            "bg-[#8b7bf6]": variant === "purple",
            "bg-[#60a5fa]": variant === "blue",
            "bg-[#7a7f94]": variant === "gray",
          })}
        />
      )}
      {children}
    </span>
  );
}
