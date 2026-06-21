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
        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-[0.08em]">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-[var(--text-secondary)] text-sm">{prefix}</span>
        )}
        <input
          className={cn(
            "w-full bg-[var(--bg-elev)] border border-[var(--border)] rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]",
            "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
            "transition-all duration-200 ease-[var(--ease-spring)]",
            prefix && "pl-9",
            suffix && "pr-9",
            error && "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[rgba(251,106,130,0.25)]",
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-[var(--text-secondary)] text-sm">{suffix}</span>
        )}
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
