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
    <header className="sticky top-0 z-50 border-b border-[#1e1e2e] bg-[#050508]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#00ff88] flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight">
            <span className="text-[#f0f0ff]">SIGNAL</span>
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
                "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-150",
                pathname.startsWith(href)
                  ? "bg-white/8 text-[#f0f0ff] border border-[#2a2a3e]"
                  : "text-[#8888aa] hover:text-[#f0f0ff] hover:bg-white/5"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] pulse-glow" />
            <span className="text-xs font-medium text-[#00ff88]">Live</span>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex border-t border-[#1e1e2e]">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
              pathname.startsWith(href)
                ? "text-[#8b5cf6]"
                : "text-[#44445a] hover:text-[#8888aa]"
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
