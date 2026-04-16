"use client";

import { useEffect, useState } from "react";

import { resolutionPhase, humanizeRemaining } from "@/lib/decay";
import { cn } from "@/lib/utils";

export interface ResolutionCountdownProps {
  /** Unix seconds. 0 => classical lending market (no resolution). */
  resolutionTimestamp: number;
  /** 0 Active, 1 PreResolution, 2 Resolved. */
  marketStatus: number;
  /** 0 unresolved, 1 YES won, 2 NO won. */
  outcomeBit: number;
  /** Compact mode for market cards; default false. */
  compact?: boolean;
}

export function ResolutionCountdown({
  resolutionTimestamp,
  marketStatus,
  outcomeBit,
  compact = false,
}: ResolutionCountdownProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const phase = resolutionPhase(resolutionTimestamp, marketStatus, now);
  const remaining = resolutionTimestamp - now;

  if (phase === "classical") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-paralend-border bg-paralend-card px-2.5 py-1 text-xs font-bold text-paralend-text-secondary",
          compact && "px-2 py-0.5"
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-paralend-text-secondary" />
        Non-resolving
      </span>
    );
  }

  if (phase === "resolved") {
    const label = outcomeBit === 1 ? "YES won" : outcomeBit === 2 ? "NO won" : "Resolved";
    const colour = outcomeBit === 1 ? "bg-paralend-green" : "bg-paralend-orange";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-paralend-border bg-white px-2.5 py-1 text-xs font-black text-paralend-text-primary",
          compact && "px-2 py-0.5"
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", colour)} />
        {label}
      </span>
    );
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums";
  const compactCls = compact ? "px-2 py-0.5" : "";
  const phaseCls =
    phase === "cutoff"
      ? "border-paralend-orange/40 bg-paralend-orange/10 text-paralend-orange"
      : phase === "force-close-window"
        ? "border-paralend-yellow/50 bg-paralend-yellow/10 text-paralend-text-primary"
        : "border-paralend-border bg-paralend-card text-paralend-text-primary";
  const dotCls =
    phase === "cutoff"
      ? "bg-paralend-orange animate-pulse"
      : phase === "force-close-window"
        ? "bg-paralend-yellow animate-pulse"
        : "bg-paralend-green";

  const label =
    phase === "cutoff"
      ? `${humanizeRemaining(remaining)} · borrow cutoff`
      : phase === "force-close-window"
        ? `${humanizeRemaining(remaining)} · force-close`
        : `${humanizeRemaining(remaining)} to resolution`;

  return (
    <span className={cn(base, compactCls, phaseCls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotCls)} />
      {label}
    </span>
  );
}
