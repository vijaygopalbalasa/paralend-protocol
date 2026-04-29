"use client";

import { useEffect, useState } from "react";

import { resolutionPhase } from "@/lib/decay";
import { formatDuration } from "@/lib/copy";
import { cn } from "@/lib/utils";

export interface ResolutionCountdownProps {
  resolutionTimestamp: number;
  marketStatus: number;
  outcomeBit: number;
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

  const baseCls =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase numerals whitespace-nowrap";
  const compactCls = compact ? "px-2 py-[3px] text-[10px]" : "";

  if (phase === "classical") {
    return <span className={cn(baseCls, compactCls, "bg-muted text-ink3")}>Evergreen</span>;
  }

  if (phase === "resolved") {
    const won = outcomeBit === 1;
    const label = outcomeBit === 1 ? "Yes won" : outcomeBit === 2 ? "No won" : "Settled";
    return (
      <span className={cn(baseCls, compactCls, won ? "bg-leaf-soft text-leaf-deep" : "bg-muted text-ink2")}>
        {label}
      </span>
    );
  }

  const phaseCls =
    phase === "cutoff"
      ? "bg-amber-soft text-amber-deep"
      : phase === "force-close-window"
      ? "bg-crimson-soft text-crimson-deep"
      : "bg-leaf-soft text-leaf-deep";

  const label =
    phase === "cutoff"
      ? `${formatDuration(remaining)} · locked`
      : phase === "force-close-window"
      ? `${formatDuration(remaining)} · last call`
      : `${formatDuration(remaining)}`;

  return <span className={cn(baseCls, compactCls, phaseCls)}>{label}</span>;
}
