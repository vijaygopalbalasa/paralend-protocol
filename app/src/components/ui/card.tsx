import { cn } from "@/lib/utils";
import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  noPadding?: boolean;
  innerClassName?: string;
  tone?: "default" | "elevated" | "outline" | "lime" | "hot";
}

export function Card({
  header,
  noPadding,
  innerClassName,
  className,
  children,
  tone = "default",
  ...props
}: CardProps) {
  const toneClasses = {
    default: "bg-white border-border",
    elevated: "bg-white border-border",
    outline: "bg-transparent border-border",
    lime: "bg-coral-soft border-coral/30",
    hot: "bg-crimson/5 border-crimson/30",
  }[tone];

  return (
    <div
      className={cn("rounded-lg border", toneClasses, className)}
      {...props}
    >
      {header && (
        <div className="px-6 py-5 flex items-center justify-between border-b border-border">
          {header}
        </div>
      )}
      <div className={cn(!noPadding && "p-6", innerClassName)}>{children}</div>
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between w-full gap-4">
      <div>
        <h3 className="font-display text-[18px] text-ink font-bold">
          {title}
        </h3>
        {description && (
          <p className="text-[13px] text-ink3 mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
