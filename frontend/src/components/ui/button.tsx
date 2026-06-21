"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] shadow-[var(--shadow-accent)]",
  secondary:
    "bg-white/[0.04] border border-[var(--border)] text-[var(--text-primary)] hover:bg-white/[0.08] hover:border-[var(--border-bright)]",
  ghost: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5",
  danger:
    "bg-[rgba(251,106,130,0.12)] border border-[rgba(251,106,130,0.3)] text-[var(--danger)] hover:bg-[rgba(251,106,130,0.2)]",
  success:
    "bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.3)] text-[var(--success)] hover:bg-[rgba(52,211,153,0.2)]",
};

const sizeStyles: Record<string, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-control)] transition-all duration-200 ease-[var(--ease-spring)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}
