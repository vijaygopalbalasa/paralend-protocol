import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export type BadgeVariant = "green" | "yellow" | "red" | "blue" | "gray" | "violet";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  green: "bg-green-100 text-green-700 border-green-200",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
  red: "bg-red-100 text-red-700 border-red-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
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
