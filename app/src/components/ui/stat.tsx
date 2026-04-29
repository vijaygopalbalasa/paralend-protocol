import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StatProps {
  label: string;
  value: string | ReactNode;
  change?: number;
  description?: string;
  className?: string;
  valueClassName?: string;
  accent?: "ink" | "coral" | "leaf" | "crimson" | "amber"
    | "lime" | "hot" | "mint" | "signal" | "alarm" | "gold" | "forest" | "masthead";
}

export function Stat({
  label,
  value,
  change,
  description,
  className,
  valueClassName,
  accent = "ink",
}: StatProps) {
  const accentClass =
    accent === "coral" || accent === "lime"
      ? "text-coral"
      : accent === "leaf" || accent === "mint" || accent === "forest"
      ? "text-leaf"
      : accent === "crimson" || accent === "alarm" || accent === "hot" || accent === "masthead"
      ? "text-crimson"
      : accent === "amber" || accent === "signal" || accent === "gold"
      ? "text-amber-deep"
      : "text-ink";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="eyebrow-xs">{label}</span>
      <div className="flex items-baseline gap-2.5">
        <span
          className={cn(
            "font-display text-3xl md:text-[36px] leading-none",
            accentClass,
            valueClassName
          )}
        >
          {value}
        </span>
        {change !== undefined && (
          <span
            className={cn(
              "text-xs font-bold numerals",
              change >= 0 ? "text-leaf" : "text-crimson"
            )}
          >
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </span>
        )}
      </div>
      {description && (
        <span className="text-[12px] text-ink3 leading-snug">{description}</span>
      )}
    </div>
  );
}
