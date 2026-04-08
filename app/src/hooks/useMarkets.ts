"use client";

/**
 * useMarkets — client-side hook for live market data.
 *
 * Uses a simple SWR-like fetch-on-mount + polling pattern.
 * Deduplicates concurrent requests via a module-level cache (client-swr-dedup).
 * Falls back to DEMO_MARKETS if RPC is unavailable.
 */

import { useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { WAD, BPS, SECONDS_PER_YEAR } from "@/lib/constants";
import IDL from "@/lib/nucleus-idl.json";
import type { Nucleus } from "@/lib/nucleus-idl-types";

export interface MarketRow {
  publicKey: string;
  collateralMint: string;
  loanMint: string;
  lltv: number;
  utilization: number;
  supplyApyPct: number;
  borrowApyPct: number;
  tvlUsd: number;
  borrowedUsd: number;
  paused: boolean;
  // Display helpers (resolved from mints if known, else shortened address)
  collateralSymbol: string;
  loanSymbol: string;
  id: string;
}

// Module-level pending promise to deduplicate concurrent fetches
let pendingFetch: Promise<MarketRow[]> | null = null;

function irmBorrowRate(
  util: bigint,
  baseRate: bigint,
  slope1: bigint,
  slope2: bigint,
  kink: bigint
): bigint {
  if (util <= kink) return baseRate + (slope1 * util) / WAD;
  const below = (slope1 * kink) / WAD;
  const above = (slope2 * (util - kink)) / WAD;
  return baseRate + below + above;
}

async function fetchAllMarkets(
  connection: import("@solana/web3.js").Connection
): Promise<MarketRow[]> {
  const dummyWallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async <T>(t: T) => t,
    signAllTransactions: async <T>(ts: T[]) => ts,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new AnchorProvider(connection, dummyWallet as any, {
    commitment: "confirmed",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program<Nucleus>(IDL as any, provider);

  const rawMarkets = await program.account.market.all();

  const rows = await Promise.all(
    rawMarkets.map(async (a) => {
      const m = a.account;
      const totalSupply = BigInt(m.totalSupplyAssets.toString());
      const totalBorrow = BigInt(m.totalBorrowAssets.toString());
      const util =
        totalSupply === 0n ? 0n : (totalBorrow * WAD) / totalSupply;
      const utilPct = Number(util) / Number(WAD);

      let borrowApyPct = 0;
      let supplyApyPct = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const irm = await (program.account as any).linearIrm.fetch(m.irm);
        const rate = irmBorrowRate(
          util,
          BigInt(irm.baseRate.toString()),
          BigInt(irm.slope1.toString()),
          BigInt(irm.slope2.toString()),
          BigInt(irm.kink.toString())
        );
        borrowApyPct =
          (Number(rate) / Number(WAD)) * Number(SECONDS_PER_YEAR) * 100;
        supplyApyPct =
          borrowApyPct * utilPct * (1 - Number(m.fee) / Number(BPS));
      } catch {
        // IRM not accessible
      }

      const LOAN_DECIMALS = 6;
      const tvlUsd = Number(totalSupply) / 10 ** LOAN_DECIMALS;
      const borrowedUsd = Number(totalBorrow) / 10 ** LOAN_DECIMALS;

      const pubkey = a.publicKey.toBase58();
      return {
        publicKey: pubkey,
        collateralMint: m.collateralMint.toBase58(),
        loanMint: m.loanMint.toBase58(),
        lltv: Number(m.lltv) / 100,
        utilization: utilPct * 100,
        supplyApyPct,
        borrowApyPct,
        tvlUsd,
        borrowedUsd,
        paused: m.paused,
        collateralSymbol: "COL",
        loanSymbol: "USDC",
        id: pubkey,
      } satisfies MarketRow;
    })
  );

  return rows;
}

export function useMarkets(pollMs = 30_000) {
  const { connection } = useConnection();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      // Deduplicate: reuse in-flight promise (client-swr-dedup)
      if (!pendingFetch) {
        pendingFetch = fetchAllMarkets(connection).finally(() => {
          pendingFetch = null;
        });
      }
      const rows = await pendingFetch;
      setMarkets(rows);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[useMarkets] RPC error, keeping stale data:", msg);
      setError(msg);
      // Keep existing data rather than resetting to empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (pollMs > 0) {
      timerRef.current = setInterval(load, pollMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  return { markets, loading, error };
}
