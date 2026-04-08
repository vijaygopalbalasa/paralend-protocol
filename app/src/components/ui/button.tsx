"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-nucleus-primary hover:bg-nucleus-primary-hover text-white border border-violet-600/50 shadow-[0_0_12px_rgba(124,58,237,0.25)]",
  secondary:
    "bg-nucleus-card hover:bg-[#252548] text-nucleus-text-primary border border-nucleus-border",
  danger:
    "bg-nucleus-red/10 hover:bg-nucleus-red/20 text-nucleus-red border border-nucleus-red/30",
  ghost:
    "bg-transparent hover:bg-white/5 text-nucleus-text-secondary border border-transparent",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs font-medium rounded-md",
  md: "h-9 px-4 text-sm font-semibold rounded-lg",
  lg: "h-11 px-6 text-base font-semibold rounded-lg",
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
          "inline-flex items-center justify-center gap-2 transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-1 focus:ring-offset-nucleus-bg",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {loading && (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
