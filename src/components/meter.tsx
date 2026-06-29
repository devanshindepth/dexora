"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MeterProps {
  label: string;
  value: number; // 0 to 100
  colorClass?: string;
}

export function Meter({ label, value, colorClass = "bg-[#89d185]" }: MeterProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className="flex flex-col gap-1 mb-3">
      <div className="flex justify-between items-end">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--foreground-muted)]">
          {label}
        </span>
        <span className="text-xs font-mono font-medium text-[var(--foreground)]">
          {Math.round(clampedValue)}
        </span>
      </div>
      <div className="h-4 w-full bg-[var(--surface-bg)] border border-[var(--border-dark)] relative overflow-hidden flex items-center">
        {/* Hash marks for Unity style */}
        <div className="absolute inset-0 flex justify-between px-[10%] opacity-20 pointer-events-none z-10">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="w-px h-full bg-[var(--foreground)]" />
          ))}
        </div>
        <motion.div
          className={cn("h-full", colorClass)}
          initial={{ width: `${clampedValue}%` }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ type: "spring", bounce: 0, duration: 0.5 }}
        />
      </div>
    </div>
  );
}
