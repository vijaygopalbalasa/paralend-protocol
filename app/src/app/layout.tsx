import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Nucleus — Permissionless Lending on Solana",
  description:
    "Create any lending market in 30 seconds. No admin. No whitelist. Just math. The Morpho Blue of Solana.",
  openGraph: {
    title: "Nucleus — Permissionless Lending on Solana",
    description:
      "Create any lending market in 30 seconds. No admin. No whitelist. Just math.",
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
      <body className="min-h-screen bg-nucleus-bg text-nucleus-text-primary antialiased selection:bg-nucleus-primary/10">
        <SolanaWalletProvider>
          <Navbar />
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
            {children}
          </main>
          <footer className="border-t border-nucleus-border/60 bg-nucleus-bg mt-16 lg:mt-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-sm text-nucleus-text-secondary">
                Built for{" "}
                <span className="text-nucleus-primary font-bold tracking-tight">
                  Colosseum Frontier 2026
                </span>
              </span>
              <div className="flex items-center gap-6 text-sm font-medium text-nucleus-text-secondary">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-nucleus-primary transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://docs.morpho.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-nucleus-primary transition-colors"
                >
                  Docs
                </a>
                <span className="px-2.5 py-1 rounded-full bg-nucleus-border/50 text-xs text-nucleus-text-secondary font-mono">devnet</span>
              </div>
            </div>
          </footer>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}
