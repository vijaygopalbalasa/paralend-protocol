/**
 * nucleus-rpc.ts
 *
 * Server-side and shared Nucleus data fetching.
 * Works in Node.js (server components, API routes) — no browser APIs.
 *
 * All RPC calls are independent; we use Promise.all per `async-parallel`.
 */

import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { Nucleus } from "./nucleus-idl-types";
import IDL from "./nucleus-idl.json";
import { BPS, RPC_ENDPOINT, SECONDS_PER_YEAR, WAD } from "./constants";

// ─── Read-only provider (no wallet needed for reads) ─────────────────────────

function makeReadonlyProvider() {
  const connection = new Connection(RPC_ENDPOINT, {
    commitment: "confirmed",
    disableRetryOnRateLimit: false,
  });
  const dummyKeypair = Keypair.generate();
  const dummyWallet = {
    publicKey: dummyKeypair.publicKey,
    signTransaction: async <T>(t: T) => t,
    signAllTransactions: async <T>(ts: T[]) => ts,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new AnchorProvider(connection, dummyWallet as any, {
    commitment: "confirmed",
  });
}

function makeProgram() {
  const provider = makeReadonlyProvider();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program<Nucleus>(IDL as any, provider);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketView {
  publicKey: string;
  collateralMint: string;
  loanMint: string;
  lltv: number;
  feeBps: number;
  totalSupplyAssets: number;
  totalBorrowAssets: number;
  utilization: number;
  supplyApyPct: number;
  borrowApyPct: number;
  tvlUsd: number;
  borrowedUsd: number;
  paused: boolean;
}

export interface ProtocolStats {
  marketCount: number;
  totalTvlUsd: number;
  totalBorrowedUsd: number;
  avgUtilization: number;
}

// ─── IRM borrow rate (mirrors on-chain kinked IRM) ───────────────────────────

function irmBorrowRatePerSecond(
  utilization: bigint,
  baseRate: bigint,
  slope1: bigint,
  slope2: bigint,
  kink: bigint
): bigint {
  if (utilization <= kink) {
    return baseRate + (slope1 * utilization) / WAD;
  }
  const below = (slope1 * kink) / WAD;
  const above = (slope2 * (utilization - kink)) / WAD;
  return baseRate + below + above;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all Market accounts from the chain.
 * Returns an array of MarketView objects ready for the UI.
 */
export async function getAllMarkets(): Promise<MarketView[]> {
  try {
    const program = makeProgram();
    const rawMarkets = await program.account.market.all();

    // Fetch IRM for each market in parallel (async-parallel rule)
    const views = await Promise.all(
      rawMarkets.map(async (a) => {
        const m = a.account;
        const totalSupply = BigInt(m.totalSupplyAssets.toString());
        const totalBorrow = BigInt(m.totalBorrowAssets.toString());

        const util =
          totalSupply === 0n
            ? 0n
            : (totalBorrow * WAD) / totalSupply;

        const utilPct = Number(util) / Number(WAD);

        // Fetch IRM for borrow rate calculation
        let borrowApyPct = 0;
        let supplyApyPct = 0;
        try {
          const irm = await (program.account as any).linearIrm.fetch(
            m.irm
          );
          const rate = irmBorrowRatePerSecond(
            util,
            BigInt(irm.baseRate.toString()),
            BigInt(irm.slope1.toString()),
            BigInt(irm.slope2.toString()),
            BigInt(irm.kink.toString())
          );
          borrowApyPct =
            (Number(rate) * Number(SECONDS_PER_YEAR)) / Number(WAD) * 100;
          supplyApyPct =
            borrowApyPct *
            utilPct *
            (1 - Number(m.fee) / Number(BPS));
        } catch {
          // IRM fetch failed — show 0%
        }

        // Use actual decimals from on-chain market account
        const LOAN_DECIMALS = m.loanDecimals ?? 6;
        const tvlUsd = Number(totalSupply) / 10 ** LOAN_DECIMALS;
        const borrowedUsd = Number(totalBorrow) / 10 ** LOAN_DECIMALS;

        return {
          publicKey: a.publicKey.toBase58(),
          collateralMint: m.collateralMint.toBase58(),
          loanMint: m.loanMint.toBase58(),
          lltv: Number(m.lltv) / 100,          // BPS → pct
          feeBps: Number(m.fee) / 100,
          totalSupplyAssets: Number(totalSupply),
          totalBorrowAssets: Number(totalBorrow),
          utilization: utilPct * 100,
          supplyApyPct,
          borrowApyPct,
          tvlUsd,
          borrowedUsd,
          paused: m.paused,
        } satisfies MarketView;
      })
    );

    return views;
  } catch (err) {
    console.error("[nucleus-rpc] getAllMarkets failed:", err);
    return [];
  }
}

/**
 * Aggregate protocol-wide stats from all markets.
 */
export async function getProtocolStats(): Promise<ProtocolStats> {
  const markets = await getAllMarkets();
  if (markets.length === 0) {
    return { marketCount: 0, totalTvlUsd: 0, totalBorrowedUsd: 0, avgUtilization: 0 };
  }

  const totalTvlUsd = markets.reduce((s, m) => s + m.tvlUsd, 0);
  const totalBorrowedUsd = markets.reduce((s, m) => s + m.borrowedUsd, 0);
  const avgUtilization =
    markets.reduce((s, m) => s + m.utilization, 0) / markets.length;

  return {
    marketCount: markets.length,
    totalTvlUsd,
    totalBorrowedUsd,
    avgUtilization,
  };
}
