import { cn } from "@/lib/utils";

interface MeterProps {
  value: number;
  tone?: "leaf" | "coral" | "crimson" | "amber" | "ink"
    | "mint" | "lime" | "signal" | "alarm" | "hot" | "gold" | "forest" | "masthead";
  label?: string;
  showValue?: boolean;
  valueSuffix?: string;
  height?: "sm" | "md" | "lg";
  className?: string;
}

export function Meter({
  value,
  tone = "leaf",
  label,
  showValue,
  valueSuffix,
  height = "md",
  className,
}: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));

  const toneBar =
    tone === "leaf" || tone === "mint" || tone === "forest"
      ? "bg-leaf"
      : tone === "crimson" || tone === "alarm" || tone === "hot" || tone === "masthead"
      ? "bg-crimson"
      : tone === "coral" || tone === "lime"
      ? "bg-coral"
      : tone === "amber" || tone === "signal" || tone === "gold"
      ? "bg-amber"
      : "bg-ink";

  const toneText =
    tone === "leaf" || tone === "mint" || tone === "forest"
      ? "text-leaf"
      : tone === "crimson" || tone === "alarm" || tone === "hot" || tone === "masthead"
      ? "text-crimson"
      : tone === "coral" || tone === "lime"
      ? "text-coral"
      : tone === "amber" || tone === "signal" || tone === "gold"
      ? "text-amber-deep"
      : "text-ink";

  const heightClass = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-3",
  }[height];

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-2">
          {label && <span className="eyebrow-xs">{label}</span>}
          {showValue && (
            <span className={cn("text-xs font-bold numerals", toneText)}>
              {clamped.toFixed(0)}{valueSuffix ?? "%"}
            </span>
          )}
        </div>
      )}
      <div className={cn("relative w-full bg-muted overflow-hidden rounded-sm", heightClass)}>
        <div
          className={cn("h-full rounded-sm", toneBar)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
