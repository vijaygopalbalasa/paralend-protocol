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
    "bg-paralend-primary hover:bg-paralend-primary-hover text-white shadow-lg shadow-black/5",
  secondary:
    "bg-white hover:bg-gray-50 text-paralend-text-primary border border-paralend-border shadow-sm",
  danger:
    "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200",
  ghost:
    "bg-transparent hover:bg-gray-100 text-paralend-text-secondary hover:text-paralend-text-primary border border-transparent",
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
          "focus:outline-none focus:ring-2 focus:ring-paralend-primary/20 focus:ring-offset-2 focus:ring-offset-white",
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
