"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Activity, BarChart2, Zap } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/copilot", label: "Copilot", icon: Zap },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-base)]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shadow-[var(--shadow-accent)] transition-transform group-hover:scale-105">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
            SIGNAL
          </span>
          <span className="tag tag-purple text-[10px] hidden sm:inline-flex">BETA</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200 ease-[var(--ease-spring)]",
                pathname.startsWith(href)
                  ? "bg-white/[0.07] text-[var(--text-primary)] border border-[var(--border-bright)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.22)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] pulse-glow" />
            <span className="text-xs font-medium text-[var(--success)]">Live</span>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex border-t border-[var(--border)]">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
              pathname.startsWith(href)
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </div>
    </header>
  );
}
