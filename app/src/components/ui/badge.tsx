import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export type BadgeVariant = "green" | "yellow" | "red" | "blue" | "gray" | "violet";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  green: "bg-nucleus-green/10 text-nucleus-green border-nucleus-green/20",
  yellow: "bg-nucleus-yellow/10 text-nucleus-yellow border-nucleus-yellow/20",
  red: "bg-nucleus-red/10 text-nucleus-red border-nucleus-red/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  gray: "bg-white/5 text-nucleus-text-secondary border-white/10",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

export function Badge({ variant = "gray", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
