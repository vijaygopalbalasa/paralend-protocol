"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  suffix?: string;
  prefix?: string;
  onMax?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, suffix, prefix, onMax, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-paralend-text-secondary mb-1.5 uppercase tracking-wide"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-paralend-text-secondary text-sm pointer-events-none select-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full bg-paralend-bg border border-paralend-border rounded-lg",
              "text-paralend-text-primary text-sm placeholder:text-paralend-text-secondary/50",
              "h-11 px-3",
              "focus:outline-none focus:ring-2 focus:ring-paralend-primary/20 focus:border-paralend-primary/60",
              "transition-colors duration-150",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error && "border-red-400 focus:ring-red-200 focus:border-red-400",
              prefix && "pl-8",
              (suffix || onMax) && "pr-20",
              className
            )}
            {...props}
          />
          <div className="absolute right-3 flex items-center gap-2">
            {suffix && (
              <span className="text-paralend-text-secondary text-sm font-medium select-none">
                {suffix}
              </span>
            )}
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                className="text-xs font-semibold text-paralend-primary hover:text-gray-600 transition-colors"
              >
                MAX
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-paralend-red">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-xs text-paralend-text-secondary">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
