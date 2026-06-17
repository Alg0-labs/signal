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
  primary: "bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] text-white hover:opacity-90 shadow-lg shadow-purple-900/30",
  secondary: "bg-white/5 border border-[#1e1e2e] text-[#f0f0ff] hover:bg-white/10 hover:border-[#2a2a3e]",
  ghost: "text-[#8888aa] hover:text-[#f0f0ff] hover:bg-white/5",
  danger: "bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 text-[#ff4d6d] hover:bg-[#ff4d6d]/20",
  success: "bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] hover:bg-[#00ff88]/20",
};

const sizeStyles: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs",
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
        "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
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
