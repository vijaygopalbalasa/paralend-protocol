// app/src/lib/decay.ts — Paralend time-decay LLTV utilities (TS mirror of
// programs/paralend/src/math/decay.rs).
//
// Keep the two in lockstep. On-chain Rust uses integer bps; this TS copy
// surfaces both the bps integer (for on-chain comparison) and a Number
// percent (for UI chart rendering).

import { MAX_BINARY_LLTV, FORCE_CLOSE_WINDOW_SECONDS } from "@/lib/constants";

/** Matches `DECAY_START_SECONDS` in programs/paralend/src/math/decay.rs. */
export const DECAY_START_SECONDS = 7 * 24 * 60 * 60;

/**
 * Client-side port of `compute_effective_lltv`.
 *
 *   effective_lltv(t) =
 *     | base (capped)              if resolution_ts == 0 or remaining >= 7d
 *     | base * remaining / 7d       if 0 < remaining < 7d
 *     | 0                           if remaining <= 0
 */
export function computeEffectiveLltvBps(
  baseLltvBps: number,
  resolutionTimestampSec: number,
  nowSec: number
): number {
  const capped = Math.min(baseLltvBps, MAX_BINARY_LLTV);
  if (resolutionTimestampSec === 0) return capped;

  const remaining = resolutionTimestampSec - nowSec;
  if (remaining <= 0) return 0;
  if (remaining >= DECAY_START_SECONDS) return capped;

  return Math.floor((capped * remaining) / DECAY_START_SECONDS);
}

/**
 * Build sample points for charting the LLTV-over-time curve.
 * Returns `{ t_sec, lltv_pct }` pairs from now through resolution.
 * Used by the DecayCurveChart component.
 */
export function decayCurveSamples(params: {
  baseLltvBps: number;
  resolutionTimestampSec: number;
  nowSec: number;
  samples?: number;
}): Array<{ t: number; lltvPct: number; label: string }> {
  const { baseLltvBps, resolutionTimestampSec, nowSec, samples = 48 } = params;
  if (resolutionTimestampSec === 0) return [];

  const totalSpan = Math.max(1, resolutionTimestampSec - nowSec);
  const step = totalSpan / samples;
  const points: Array<{ t: number; lltvPct: number; label: string }> = [];

  for (let i = 0; i <= samples; i++) {
    const t = nowSec + step * i;
    const lltvBps = computeEffectiveLltvBps(
      baseLltvBps,
      resolutionTimestampSec,
      t
    );
    const remaining = resolutionTimestampSec - t;
    points.push({
      t,
      lltvPct: lltvBps / 100,
      label: humanizeRemaining(remaining),
    });
  }
  return points;
}

/** "14d", "5h 23m", "12m 5s", "now", "past" */
export function humanizeRemaining(seconds: number): string {
  if (seconds <= 0) return "past";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/** Returns the resolution-phase classification used by the UI. */
export function resolutionPhase(
  resolutionTimestampSec: number,
  marketStatus: number,
  nowSec: number = Math.floor(Date.now() / 1000)
): "classical" | "active" | "force-close-window" | "cutoff" | "resolved" {
  if (resolutionTimestampSec === 0) return "classical";
  if (marketStatus === 2) return "resolved";

  const remaining = resolutionTimestampSec - nowSec;
  // Matches on-chain POST_BORROW_CUTOFF_SECONDS (30 min).
  if (remaining <= 1_800) return "cutoff";
  if (remaining <= FORCE_CLOSE_WINDOW_SECONDS) return "force-close-window";
  return "active";
}
