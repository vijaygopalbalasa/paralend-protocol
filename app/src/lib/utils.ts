import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSD(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatUSDFull(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatAPY(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function formatHealthFactor(hf: number): string {
  if (hf >= 999) return "∞";
  return hf.toFixed(2);
}

export function healthFactorColor(hf: number): string {
  if (hf >= 1.5) return "text-nucleus-green";
  if (hf >= 1.1) return "text-nucleus-yellow";
  return "text-nucleus-red";
}

export function healthFactorBg(hf: number): string {
  if (hf >= 1.5) return "bg-nucleus-green/10 text-nucleus-green border-nucleus-green/20";
  if (hf >= 1.1) return "bg-nucleus-yellow/10 text-nucleus-yellow border-nucleus-yellow/20";
  return "bg-nucleus-red/10 text-nucleus-red border-nucleus-red/20";
}

export function utilizationColor(util: number): string {
  if (util < 60) return "bg-nucleus-green";
  if (util < 85) return "bg-nucleus-yellow";
  return "bg-nucleus-red";
}
