import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Paralend — Credit for Prediction Markets on Solana",
  description:
    "Borrow USDC against your tokenized Kalshi YES/NO positions. Time-decay LLTV, onchain resolution, permissionless — the first credit layer for the $20B+ prediction-market collateral pool.",
  openGraph: {
    title: "Paralend — Credit for Prediction Markets on Solana",
    description:
      "Borrow USDC against tokenized Kalshi positions. Time-decay LLTV + onchain resolution + force-close window.",
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
      <body className="min-h-screen bg-paralend-bg text-paralend-text-primary antialiased selection:bg-paralend-primary/10">
        <SolanaWalletProvider>
          <Navbar />
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
            {children}
          </main>
          <footer className="border-t border-paralend-border/60 bg-paralend-bg mt-16 lg:mt-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-sm text-paralend-text-secondary">
                Built for{" "}
                <span className="text-paralend-primary font-bold tracking-tight">
                  Colosseum Frontier 2026
                </span>
              </span>
              <div className="flex items-center gap-6 text-sm font-medium text-paralend-text-secondary">
                <a
                  href="https://github.com/vijaygopalbalasa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-paralend-primary transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://news.kalshi.com/p/kalshi-solana-tokenized-predictions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-paralend-primary transition-colors"
                >
                  Kalshi on Solana
                </a>
                <span className="px-2.5 py-1 rounded-full bg-paralend-border/50 text-xs text-paralend-text-secondary font-mono">devnet</span>
              </div>
            </div>
          </footer>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}
