"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "signal"
  | "alarm"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-white border-transparent hover:bg-ink2",
  secondary:
    "bg-white text-ink border-border hover:border-ink",
  signal:
    "bg-ink text-white border-transparent hover:bg-ink2",
  alarm:
    "bg-crimson text-white border-transparent hover:bg-crimson-deep",
  ghost:
    "bg-transparent text-ink2 border-transparent hover:text-coral hover:bg-coral-soft",
  danger:
    "bg-white text-crimson border-crimson hover:bg-crimson hover:text-white",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 rounded-md px-4 text-[13px] font-bold",
  md: "h-11 rounded-md px-5 text-[14px] font-bold",
  lg: "h-12 rounded-md px-6 text-[15px] font-bold",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 border transition-colors duration-150 ease-out",
          "active:scale-[0.99]",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100",
          "focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {loading && (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
