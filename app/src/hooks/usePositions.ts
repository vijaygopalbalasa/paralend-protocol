"use client";

import { useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { resolveTokenSymbol } from "@/lib/demo-config";
import {
  bnToBigInt,
  calculateHealthFactor,
  deriveMarketPDA,
  deriveStaticOraclePDA,
  getProgramId,
  makeReadonlyProgram,
  toAssetsDown,
  toAssetsUp,
} from "@/lib/paralend-program";
import { WAD } from "@/lib/constants";

export interface PositionRow {
  publicKey: string;
  marketPubkey: string;
  collateralMint: string;
  loanMint: string;
  supplyShares: bigint;
  borrowShares: bigint;
  collateralAmount: bigint;
  collateralDecimals: number;
  loanDecimals: number;
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
      const program = makeReadonlyProgram(connection, getProgramId());

      const rawPositions = await program.account.position.all([
        {
          memcmp: {
            offset: 8 + 1 + 32,
            bytes: publicKey.toBase58(),
          },
        },
      ]);

      const marketCache = new Map<string, Awaited<ReturnType<typeof program.account.market.fetch>>>();
      const oracleCache = new Map<string, bigint>();

      const rows = await Promise.all(
        rawPositions.map(async (entry) => {
          const position = entry.account;
          const marketId = Buffer.from(position.marketId as number[]);
          const marketPda = deriveMarketPDA(marketId);
          const marketAddress = marketPda.toBase58();

          let market = marketCache.get(marketAddress);
          if (!market) {
            market = await program.account.market.fetch(marketPda);
            marketCache.set(marketAddress, market);
          }

          const totalSupplyAssets = bnToBigInt(market.totalSupplyAssets);
          const totalSupplyShares = bnToBigInt(market.totalSupplyShares);
          const totalBorrowAssets = bnToBigInt(market.totalBorrowAssets);
          const totalBorrowShares = bnToBigInt(market.totalBorrowShares);
          const supplyShares = bnToBigInt(position.supplyShares);
          const borrowShares = bnToBigInt(position.borrowShares);
          const collateralAmount = bnToBigInt(position.collateral);
          const loanDecimals = market.loanDecimals ?? 6;
          const collateralDecimals = market.collateralDecimals ?? 9;

          const supplyAssets =
            supplyShares > 0n
              ? toAssetsDown(supplyShares, totalSupplyAssets, totalSupplyShares)
              : 0n;
          const borrowAssets =
            borrowShares > 0n
              ? toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)
              : 0n;

          const collateralOracleFeed = Buffer.from(
            market.collateralOracleFeedId as number[]
          );
          const collateralOracle = deriveStaticOraclePDA(collateralOracleFeed);
          let collateralPriceWad = oracleCache.get(collateralOracle.toBase58());
          if (collateralPriceWad === undefined) {
            const oracle = await program.account.staticOracle.fetch(collateralOracle);
            collateralPriceWad = bnToBigInt(oracle.priceWad);
            oracleCache.set(collateralOracle.toBase58(), collateralPriceWad);
          }

          let loanPriceWad: bigint;
          const loanFeed = Buffer.from(market.loanOracleFeedId as number[]);
          if (loanFeed.every((byte) => byte === 0)) {
            loanPriceWad = WAD / 10n ** BigInt(loanDecimals);
          } else {
            const loanOracle = deriveStaticOraclePDA(loanFeed);
            const cacheKey = loanOracle.toBase58();
            let cached = oracleCache.get(cacheKey);
            if (cached === undefined) {
              const oracle = await program.account.staticOracle.fetch(loanOracle);
              cached = bnToBigInt(oracle.priceWad);
              oracleCache.set(cacheKey, cached);
            }
            loanPriceWad = cached;
          }

          const supplyAssetsUsd =
            Number((supplyAssets * loanPriceWad) / WAD) / 10 ** loanDecimals;
          const borrowAssetsUsd =
            Number((borrowAssets * loanPriceWad) / WAD) / 10 ** loanDecimals;
          const collateralValueUsd =
            Number((collateralAmount * collateralPriceWad) / WAD) /
            10 ** collateralDecimals;
          const healthFactor = calculateHealthFactor({
            collateral: collateralAmount,
            borrowShares,
            totalBorrowAssets,
            totalBorrowShares,
            lltv: bnToBigInt(market.lltv),
            collateralPriceWad,
            loanPriceWad,
          });

          const collateralMint = market.collateralMint.toBase58();
          const loanMint = market.loanMint.toBase58();

          return {
            publicKey: entry.publicKey.toBase58(),
            marketPubkey: marketAddress,
            collateralMint,
            loanMint,
            supplyShares,
            borrowShares,
            collateralAmount,
            collateralDecimals,
            loanDecimals,
            supplyAssetsUsd,
            borrowAssetsUsd,
            collateralValueUsd,
            healthFactor,
            collateralSymbol: resolveTokenSymbol(collateralMint),
            loanSymbol: resolveTokenSymbol(loanMint),
            id: entry.publicKey.toBase58(),
          } satisfies PositionRow;
        })
      );

      setPositions(
        rows.filter(
          (row) =>
            row.supplyShares > 0n ||
            row.borrowShares > 0n ||
            row.collateralAmount > 0n
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

  return { positions, loading, reload: load };
}
