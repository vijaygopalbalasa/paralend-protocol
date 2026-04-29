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
  (
    { label, error, hint, suffix, prefix, onMax, className, id, ...props },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[12px] font-bold text-ink2 mb-2">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-5 text-ink3 text-base font-bold pointer-events-none select-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full rounded-lg border border-border bg-white",
              "numerals text-ink text-xl font-bold",
              "placeholder:text-ink4 placeholder:font-bold",
              "h-14 px-4",
              "transition-colors duration-150",
              "focus:outline-none focus:border-ink",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error && "border-crimson",
              prefix && "pl-10",
              (suffix || onMax) && "pr-28",
              className
            )}
            {...props}
          />
          <div className="absolute right-3 flex items-center gap-2">
            {suffix && (
              <span className="text-ink3 text-xs font-bold uppercase tracking-wider select-none">
                {suffix}
              </span>
            )}
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-ink"
              >
                Max
              </button>
            )}
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-crimson font-semibold">{error}</p>}
        {hint && !error && (
          <p className="mt-2 text-[12px] text-ink3 font-medium">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
