import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Paralend — Prediction-market credit",
  description:
    "Isolated lending markets for tokenized prediction-market positions on Solana.",
  openGraph: {
    title: "Paralend — Prediction-market credit",
    description:
      "Isolated lending markets for tokenized prediction-market positions on Solana.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-ink antialiased">
        <SolanaWalletProvider>
          <Navbar />
          <main className="relative z-10">{children}</main>
          <SiteFooter />
        </SolanaWalletProvider>
      </body>
    </html>
  );
}

function SiteFooter() {
  return (
    <footer className="relative mt-16 border-t border-border bg-bg">
      <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:px-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-6">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink">
                <span className="font-display text-[18px] font-extrabold text-white leading-none">P</span>
              </div>
              <span className="font-display text-2xl font-extrabold text-ink">
                Paralend
              </span>
            </div>
            <p className="text-ink2 max-w-sm text-[14px] leading-relaxed">
              Isolated credit markets for tokenized prediction collateral on
              Solana devnet.
            </p>
          </div>

          <div className="md:col-span-3">
            <div className="eyebrow-xs mb-4">Product</div>
            <ul className="space-y-2.5 text-[14px]">
              <li><Link href="/markets" className="text-ink hover:text-coral font-medium transition-colors">Markets</Link></li>
              <li><Link href="/positions" className="text-ink hover:text-coral font-medium transition-colors">Portfolio</Link></li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <div className="eyebrow-xs mb-4">Network</div>
            <div className="flex flex-col gap-2.5 text-[14px]">
              <a
                href="https://news.kalshi.com/p/kalshi-solana-tokenized-predictions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink hover:text-coral font-medium transition-colors inline-flex items-center gap-1"
              >
                Kalshi on Solana
              </a>
              <a
                href="https://explorer.solana.com/address/2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8?cluster=devnet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink hover:text-coral font-medium transition-colors inline-flex items-center gap-1"
              >
                Devnet program
              </a>
              <span className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink2">
                Solana devnet
              </span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-[12px] font-medium text-ink3 sm:flex-row sm:items-center">
          <span>Built for Colosseum Frontier 2026</span>
          <span>Live devnet deployment</span>
        </div>
      </div>
    </footer>
  );
}
