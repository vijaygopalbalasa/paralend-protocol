"use client";

/**
 * usePositions — fetch all Nucleus Position accounts for the connected wallet.
 *
 * Health factor calculation mirrors programs/nucleus/src/instructions/liquidate.rs.
 */

import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { WAD, BPS, SECONDS_PER_YEAR } from "@/lib/constants";
import IDL from "@/lib/nucleus-idl.json";
import type { Nucleus } from "@/lib/nucleus-idl-types";

const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1n;

function toAssetsUp(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = totalShares + VIRTUAL_SHARES;
  return (num + den - 1n) / den;
}

function calcHealthFactor(
  collateral: bigint,
  borrowShares: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
  lltv: bigint,
  collateralPriceWad: bigint,
  loanPriceWad: bigint
): number {
  if (borrowShares === 0n) return Infinity;
  const borrowAssets = toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares);
  if (borrowAssets === 0n) return Infinity;
  const collUsd = (collateral * collateralPriceWad) / WAD;
  const loanUsd = (borrowAssets * loanPriceWad + WAD - 1n) / WAD;
  if (loanUsd === 0n) return Infinity;
  return Number(collUsd * lltv) / Number(loanUsd * BPS);
}

export interface PositionRow {
  publicKey: string;
  marketPubkey: string;
  collateralMint: string;
  loanMint: string;
  supplyShares: bigint;
  borrowShares: bigint;
  collateralAmount: bigint;
  // Derived display values
  supplyAssetsUsd: number;
  borrowAssetsUsd: number;
  collateralValueUsd: number;
  healthFactor: number;
  collateralSymbol: string;
  loanSymbol: string;
  id: string;
}

export function usePositions(pollMs = 15_000) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    if (!publicKey) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
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

      // Fetch all positions for this wallet via memcmp filter on `owner` field
      // Position layout: 8 (disc) + 1 (bump) + 32 (market_id) + 32 (owner) + ...
      // owner is at offset 8 + 1 + 32 = 41
      const rawPositions = await program.account.position.all([
        {
          memcmp: {
            offset: 8 + 1 + 32, // discriminator + bump + market_id
            bytes: publicKey.toBase58(),
          },
        },
      ]);

      // Fetch markets for each position in parallel
      const rows = await Promise.all(
        rawPositions.map(async (p) => {
          const pos = p.account;
          const marketIdBuf = Buffer.from(pos.marketId as number[]);

          let supplyAssetsUsd = 0;
          let borrowAssetsUsd = 0;
          let collateralValueUsd = 0;
          let healthFactor = Infinity;
          let collateralMint = "";
          let loanMint = "";

          try {
            const [marketPda] = PublicKey.findProgramAddressSync(
              [Buffer.from("nucleus"), Buffer.from("market"), marketIdBuf],
              program.programId
            );
            const market = await program.account.market.fetch(marketPda);
            collateralMint = market.collateralMint.toBase58();
            loanMint = market.loanMint.toBase58();

            const totalSupply = BigInt(market.totalSupplyAssets.toString());
            const totalSupplyShares = BigInt(market.totalSupplyShares.toString());
            const totalBorrow = BigInt(market.totalBorrowAssets.toString());
            const totalBorrowShares = BigInt(market.totalBorrowShares.toString());

            // Supply value (shares → assets)
            const LOAN_DECIMALS = 6;
            const COLL_DECIMALS = 9;

            const supplyShares = BigInt(pos.supplyShares.toString());
            if (supplyShares > 0n) {
              const supplyAssets = toAssetsUp(supplyShares, totalSupply, totalSupplyShares);
              supplyAssetsUsd = Number(supplyAssets) / 10 ** LOAN_DECIMALS;
            }

            const borrowShares = BigInt(pos.borrowShares.toString());
            if (borrowShares > 0n) {
              const borrowAssets = toAssetsUp(borrowShares, totalBorrow, totalBorrowShares);
              borrowAssetsUsd = Number(borrowAssets) / 10 ** LOAN_DECIMALS;
            }

            const collateral = BigInt(pos.collateral.toString());
            // Use WAD-scaled price: for SOL at $165 with 9 decimals → 165e18/1e9 = 165e9
            // We approximate: $165 per SOL base unit = 165e9 WAD
            const colPriceWad = 165n * (WAD / 1_000_000_000n);
            const loanPriceWad = WAD / 1_000_000n;
            collateralValueUsd = Number((collateral * colPriceWad) / WAD) / 1;
            // Rough: collateral * price / 1e9 = USD
            collateralValueUsd = (Number(collateral) / 10 ** COLL_DECIMALS) * 165;

            healthFactor = calcHealthFactor(
              collateral,
              borrowShares,
              totalBorrow,
              totalBorrowShares,
              BigInt(market.lltv.toString()),
              colPriceWad,
              loanPriceWad
            );
          } catch {
            // market fetch failed
          }

          return {
            publicKey: p.publicKey.toBase58(),
            marketPubkey: "",
            collateralMint,
            loanMint,
            supplyShares: BigInt(pos.supplyShares.toString()),
            borrowShares: BigInt(pos.borrowShares.toString()),
            collateralAmount: BigInt(pos.collateral.toString()),
            supplyAssetsUsd,
            borrowAssetsUsd,
            collateralValueUsd,
            healthFactor,
            collateralSymbol: "SOL",
            loanSymbol: "USDC",
            id: p.publicKey.toBase58(),
          } satisfies PositionRow;
        })
      );

      // Only show positions that have any activity
      setPositions(
        rows.filter(
          (r) => r.supplyShares > 0n || r.borrowShares > 0n || r.collateralAmount > 0n
        )
      );
    } catch (err) {
      console.error("[usePositions]", err);
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
  }, [connection, publicKey?.toBase58()]);

  return { positions, loading };
}
