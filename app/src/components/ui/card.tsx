import { cn } from "@/lib/utils";
import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  noPadding?: boolean;
  innerClassName?: string;
}

export function Card({ header, noPadding, innerClassName, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-nucleus-card border border-nucleus-border rounded-xl",
        className
      )}
      {...props}
    >
      {header && (
        <div className="px-5 py-4 border-b border-nucleus-border flex items-center justify-between">
          {header}
        </div>
      )}
      <div className={cn(!noPadding && "p-5", innerClassName)}>{children}</div>
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
    <div className="flex items-start justify-between w-full">
      <div>
        <h2 className="text-base font-semibold text-nucleus-text-primary">{title}</h2>
        {description && (
          <p className="text-xs text-nucleus-text-secondary mt-0.5">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
