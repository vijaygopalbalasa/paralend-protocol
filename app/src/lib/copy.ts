/**
 * Single source of truth for user-facing copy.
 * Product copy for the frontend.
 */

export const BRAND = {
  name: "Paralend",
  tagline: "Prediction-market credit.",
  punchline: "Isolated lending markets for tokenized prediction collateral.",
  longDesc:
    "A credit layer for tokenized prediction markets on Solana. Supply stablecoin, post prediction collateral, borrow, and manage settlement risk.",
};

export const PHASE_LABEL: Record<number, string> = {
  0: "Open",
  1: "Last call",
  2: "Settled",
};

export const PHASE_DESCRIPTION: Record<number, string> = {
  0: "Open for earning, borrowing, and repaying.",
  1: "Borrow power is tightening before the event settles.",
  2: "Event is over. Winners redeem, losers are closed.",
};

export const COPY = {
  earn: {
    title: "Earn",
    action: "Lend stablecoin",
    explainer:
      "Supply stablecoin to isolated pools backed by prediction-market collateral.",
  },
  borrow: {
    title: "Borrow",
    action: "Borrow stablecoin",
    explainer:
      "Post YES or NO collateral and borrow stablecoin up to the current effective LLTV.",
  },
  deposit: {
    title: "Collateral",
    action: "Add collateral",
    explainer:
      "Collateral remains in the market vault until debt is repaid or settlement handling closes the position.",
  },
  lastCall: {
    label: "Last call",
    headline: "Final two-hour window",
    description:
      "The event settles in under two hours. Borrow power is near zero, and anyone can close unsafe positions for a reward.",
  },
  safety: {
    good: "Safe",
    ok: "OK",
    warning: "Watch",
    danger: "At risk",
  },
  resolution: {
    settledYes: "Settled — YES won",
    settledNo: "Settled — NO won",
    settledUpcoming: "Settles in",
    notScheduled: "No settlement date",
  },
  empty: {
    noMarkets: "No open markets yet. The first one lands soon.",
    noPositions: "You haven't opened a position yet.",
    notConnected: "Connect a Solana wallet to see your portfolio.",
  },
};

/**
 * Derive human-readable safety tier from a numeric health factor.
 * health factor >= 1.5 -> Safe, >= 1.1 -> OK, >= 1.0 -> Watch, else At risk.
 */
export function safetyLabel(hf: number): string {
  if (hf >= 1.5) return COPY.safety.good;
  if (hf >= 1.1) return COPY.safety.ok;
  if (hf >= 1.0) return COPY.safety.warning;
  return COPY.safety.danger;
}

export function safetyTone(
  hf: number
): "mint" | "signal" | "alarm" {
  if (hf >= 1.5) return "mint";
  if (hf >= 1.1) return "signal";
  return "alarm";
}

/**
 * Convert a health factor into a 0..100 "safety score" for display as a meter.
 * hf < 1 maps to <33, hf = 1 maps to 33, hf = 1.5 maps to 66, hf >= 2 maps to 100.
 */
export function safetyScore(hf: number): number {
  if (hf >= 999) return 100;
  if (hf <= 0) return 0;
  if (hf >= 2) return 100;
  if (hf >= 1.5) return 66 + ((hf - 1.5) / 0.5) * 34;
  if (hf >= 1) return 33 + ((hf - 1) / 0.5) * 33;
  return Math.max(0, hf * 33);
}

/**
 * Humanize seconds remaining: "3d 4h", "12h 32m", "4m 05s".
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/**
 * Short countdown for tight spaces.
 */
export function formatDurationTight(seconds: number): string {
  if (seconds <= 0) return "settled";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Phase of a market for the UI state machine.
 *  - closed:   no resolution set (classic lending)
 *  - open:     plenty of runway
 *  - narrowing: inside the 7-day decay window
 *  - last-call: inside the 2-hour force-close window
 *  - settled:  outcome recorded
 */
export type MarketPhase = "closed" | "open" | "narrowing" | "last-call" | "settled";

export function marketPhase(
  resolutionTs: number,
  marketStatus: number,
  nowSec = Math.floor(Date.now() / 1000)
): MarketPhase {
  if (marketStatus === 2) return "settled";
  if (resolutionTs === 0) return "closed";
  const remaining = resolutionTs - nowSec;
  if (remaining <= 0) return "settled";
  if (remaining <= 2 * 3600) return "last-call";
  if (remaining <= 7 * 86400) return "narrowing";
  return "open";
}

export function marketPhaseRank(phase: MarketPhase): number {
  switch (phase) {
    case "narrowing":
      return 0;
    case "last-call":
      return 1;
    case "open":
      return 2;
    case "closed":
      return 3;
    case "settled":
      return 4;
  }
}

export function phaseAccentClass(phase: MarketPhase): string {
  switch (phase) {
    case "last-call":
      return "text-alarm";
    case "narrowing":
      return "text-signal";
    case "settled":
      return "text-ink-300";
    default:
      return "text-mint-deep";
  }
}
