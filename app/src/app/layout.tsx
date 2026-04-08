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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0F0F23] text-[#E2E8F0] antialiased">
        <SolanaWalletProvider>
          <Navbar />
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </main>
          <footer className="border-t border-nucleus-border mt-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-nucleus-text-secondary">
                Built for{" "}
                <span className="text-nucleus-primary font-semibold">
                  Colosseum Frontier 2026
                </span>
              </span>
              <div className="flex items-center gap-4 text-xs text-nucleus-text-secondary">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-nucleus-text-primary transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://docs.morpho.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-nucleus-text-primary transition-colors"
                >
                  Docs
                </a>
                <span>devnet</span>
              </div>
            </div>
          </footer>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}
