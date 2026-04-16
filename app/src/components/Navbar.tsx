"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/create", label: "Create Market" },
  { href: "/positions", label: "My Positions" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-paralend-border bg-paralend-bg/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 group"
          >
            <span className="text-lg font-black tracking-tight text-paralend-primary group-hover:text-gray-600 transition-colors">
              Paralend
            </span>
            <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-widest text-paralend-text-secondary border border-paralend-border rounded px-1.5 py-0.5">
              devnet
            </span>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-semibold transition-colors",
                    active
                      ? "bg-paralend-primary text-white"
                      : "text-paralend-text-secondary hover:text-paralend-primary hover:bg-gray-100"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Wallet button */}
          <div className="shrink-0">
            <WalletMultiButton />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden gap-1 pb-2 overflow-x-auto no-scrollbar">
          {NAV_LINKS.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors",
                  active
                    ? "bg-paralend-primary text-white"
                    : "text-paralend-text-secondary hover:text-paralend-primary hover:bg-gray-100"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
