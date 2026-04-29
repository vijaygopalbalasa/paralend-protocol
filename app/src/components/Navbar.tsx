"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/positions", label: "Portfolio" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-bg/85 backdrop-blur-xl border-b border-border">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-ink">
              <span className="font-display text-[16px] font-extrabold text-white leading-none">
                P
              </span>
            </div>
            <span className="font-display text-[20px] font-extrabold text-ink">
              Paralend
            </span>
          </Link>

          <div className="hidden items-center gap-1 rounded-lg border border-border bg-white p-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-[13px] font-bold transition-colors",
                    active
                      ? "bg-ink text-white"
                      : "text-ink2 hover:text-ink hover:bg-muted"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <WalletMultiButton />
          </div>
        </div>

        <div className="flex md:hidden gap-1 pb-3 overflow-x-auto no-scrollbar">
          {NAV_LINKS.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 rounded-md px-3.5 py-1.5 text-[12px] font-bold transition-colors",
                  active ? "bg-ink text-white" : "text-ink2 hover:bg-muted"
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
