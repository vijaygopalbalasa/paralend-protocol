import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export type BadgeVariant =
  | "ink"
  | "coral"
  | "leaf"
  | "crimson"
  | "amber"
  | "outline"
  // legacy aliases
  | "lime"
  | "hot"
  | "mint"
  | "signal"
  | "alarm"
  | "gold"
  | "masthead"
  | "forest"
  | "gray"
  | "green"
  | "yellow"
  | "red"
  | "blue"
  | "violet";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  pulse?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  ink: "bg-ink text-white",
  coral: "bg-coral-soft text-coral-deep",
  leaf: "bg-leaf-soft text-leaf-deep",
  crimson: "bg-crimson-soft text-crimson-deep",
  amber: "bg-amber-soft text-amber-deep",
  outline: "bg-white text-ink2 border border-border",
  // legacy
  lime: "bg-coral-soft text-coral-deep",
  hot: "bg-crimson-soft text-crimson-deep",
  mint: "bg-leaf-soft text-leaf-deep",
  signal: "bg-amber-soft text-amber-deep",
  alarm: "bg-crimson-soft text-crimson-deep",
  gold: "bg-amber-soft text-amber-deep",
  masthead: "bg-crimson-soft text-crimson-deep",
  forest: "bg-leaf-soft text-leaf-deep",
  gray: "bg-muted text-ink2",
  green: "bg-leaf-soft text-leaf-deep",
  yellow: "bg-amber-soft text-amber-deep",
  red: "bg-crimson-soft text-crimson-deep",
  blue: "bg-muted text-ink2",
  violet: "bg-muted text-ink2",
};

export function Badge({
  variant = "outline",
  pulse,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
