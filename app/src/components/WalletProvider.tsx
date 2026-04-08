"use client";

import { type ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { RPC_ENDPOINT } from "@/lib/constants";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CP = ConnectionProvider as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WP = WalletProvider as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WMP = WalletModalProvider as any;

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const network = WalletAdapterNetwork.Devnet;

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  return (
    <CP endpoint={RPC_ENDPOINT}>
      <WP wallets={wallets} autoConnect>
        <WMP>{children}</WMP>
      </WP>
    </CP>
  );
}
