"use client";

import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { AlertCircle, type LucideIcon } from "lucide-react";

/** Shimmering skeleton block — use while data loads instead of a bare spinner. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/** A few stacked skeleton lines for list/card loading. */
export function SkeletonLines({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" />
      ))}
    </div>
  );
}

/**
 * Empty / onboarding state — what the user sees before they act.
 * Gives a clear "do this first" instead of a blank panel.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <FadeIn className={cn("flex flex-col items-center text-center px-6 py-10", className)}>
      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-bright)] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-[var(--accent)]" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {hint && (
        <p className="text-xs text-[var(--text-muted)] mt-3 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-[var(--border)]">
          {hint}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </FadeIn>
  );
}

/** Inline error block with a retry slot. */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <FadeIn className={cn("flex flex-col items-center text-center px-6 py-8", className)}>
      <div className="w-10 h-10 rounded-xl bg-[rgba(251,106,130,0.12)] border border-[rgba(251,106,130,0.25)] flex items-center justify-center mb-3">
        <AlertCircle className="w-5 h-5 text-[var(--danger)]" />
      </div>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] bg-white/5 border border-[var(--border-bright)] hover:bg-white/10 active:scale-[0.97] transition-all"
        >
          Try again
        </button>
      )}
    </FadeIn>
  );
}
