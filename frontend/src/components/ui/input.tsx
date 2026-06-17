"use client";

import { cn } from "@/lib/utils";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function Input({ label, error, prefix, suffix, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-[#8888aa] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-[#8888aa] text-sm">{prefix}</span>
        )}
        <input
          className={cn(
            "w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-sm text-[#f0f0ff] placeholder-[#44445a]",
            "focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30",
            "transition-colors duration-150",
            prefix && "pl-9",
            suffix && "pr-9",
            error && "border-[#ff4d6d] focus:border-[#ff4d6d] focus:ring-[#ff4d6d]/30",
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-[#8888aa] text-sm">{suffix}</span>
        )}
      </div>
      {error && <p className="text-xs text-[#ff4d6d]">{error}</p>}
    </div>
  );
}
