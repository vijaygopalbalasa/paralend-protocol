"use client";

import { cn } from "@/lib/utils";

interface NumberTickerProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  currency?: boolean;
  className?: string;
}

export function NumberTicker({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  currency,
  className,
}: NumberTickerProps) {
  let text: string;
  if (currency) {
    if (value >= 1_000_000) text = `$${(value / 1_000_000).toFixed(2)}M`;
    else if (value >= 1_000) text = `$${(value / 1_000).toFixed(1)}K`;
    else text = `$${value.toFixed(0)}`;
  } else {
    text = value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (prefix) text = prefix + text;
    if (suffix) text = text + suffix;
  }

  return (
    <span className={cn("numerals inline-block tabular-nums", className)}>
      {text}
    </span>
  );
}
