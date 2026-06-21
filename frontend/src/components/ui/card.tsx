"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { spring } from "@/components/ui/motion";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  glow?: "green" | "purple" | "blue" | "none";
  onClick?: () => void;
  /** Animate in on mount with a spring. */
  animate?: boolean;
  delay?: number;
}

export function Card({ children, className, style, glow = "none", onClick, animate = false, delay = 0 }: CardProps) {
  return (
    <motion.div
      onClick={onClick}
      style={style}
      initial={animate ? { opacity: 0, y: 14 } : false}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...spring, delay }}
      whileHover={onClick ? { y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
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
    </motion.div>
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
    <h3 className={cn("text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-[0.08em]", className)}>
      {children}
    </h3>
  );
}
