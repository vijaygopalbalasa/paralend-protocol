import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: string;
  change?: number; // positive = green, negative = red
  description?: string;
  className?: string;
  valueClassName?: string;
}

export function Stat({ label, value, change, description, className, valueClassName }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[10px] font-bold text-nucleus-text-secondary uppercase tracking-wider mb-1">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-black text-nucleus-text-primary tabular-nums tracking-tight",
            valueClassName
          )}
        >
          {value}
        </span>
        {change !== undefined && (
          <span
            className={cn(
              "text-xs font-semibold",
              change >= 0 ? "text-nucleus-green" : "text-nucleus-red"
            )}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        )}
      </div>
      {description && (
        <span className="text-xs text-nucleus-text-secondary">{description}</span>
      )}
    </div>
  );
}
