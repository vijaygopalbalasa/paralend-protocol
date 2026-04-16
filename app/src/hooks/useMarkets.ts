"use client";

import { useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import { useConnection } from "@solana/wallet-adapter-react";

import { getDemoMarket, resolveTokenSymbol } from "@/lib/demo-config";
import {
  annualizedPercent,
  bnToBigInt,
  calculateUtilization,
  computeMarketIdFromAccount,
  irmBorrowRatePerSecond,
  makeReadonlyProgram,
} from "@/lib/paralend-program";
import { BPS, WAD } from "@/lib/constants";

export interface MarketRow {
  publicKey: string;
  marketIdHex: string;
  collateralMint: string;
  loanMint: string;
  lltv: number;
  baseLltv: number;
  utilization: number;
  supplyApyPct: number;
  borrowApyPct: number;
  tvlUsd: number;
  borrowedUsd: number;
  paused: boolean;
  feeBps: number;
  collateralSymbol: string;
  loanSymbol: string;
  oracleLabel: string;
  name: string;
  id: string;
  /** Unix seconds when the Kalshi market resolves. 0 = classical lending market. */
  resolutionTimestamp: number;
  /** 0 = Active, 1 = PreResolution, 2 = Resolved. */
  marketStatus: number;
  /** 0 = unresolved, 1 = YES won, 2 = NO won. */
  outcomeBit: number;
  /** Human-readable Kalshi ticker decoded from the on-chain bytes (trimmed). */
  kalshiTicker: string;
}

let pendingFetch: Promise<MarketRow[]> | null = null;

async function fetchAllMarkets(
  connection: import("@solana/web3.js").Connection
): Promise<MarketRow[]> {
  const program = makeReadonlyProgram(connection);
  const rawMarkets = await program.account.market.all();

  return Promise.all(
    rawMarkets.map(async (entry) => {
      const market = entry.account;
      const publicKey = entry.publicKey.toBase58();
      const marketId = computeMarketIdFromAccount(market);
      const marketIdHex = marketId.toString("hex");
      const totalSupply = bnToBigInt(market.totalSupplyAssets);
      const totalBorrow = bnToBigInt(market.totalBorrowAssets);
      const utilization = calculateUtilization(totalBorrow, totalSupply);
      const utilizationPct = (Number(utilization) / Number(WAD)) * 100;

      let borrowApyPct = 0;
      let supplyApyPct = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const irm = await (program.account as any).linearIrm.fetch(market.irm);
        const borrowRate = irmBorrowRatePerSecond(
          utilization,
          bnToBigInt(irm.baseRate),
          bnToBigInt(irm.slope1),
          bnToBigInt(irm.slope2),
          bnToBigInt(irm.kink)
        );
        borrowApyPct = annualizedPercent(borrowRate);
        supplyApyPct =
          borrowApyPct *
          (Number(utilization) / Number(WAD)) *
          (1 - Number(market.fee) / Number(BPS));
      } catch {
        // Leave rates at 0 on IRM lookup failure.
      }

      const loanDecimals = market.loanDecimals ?? 6;
      const tvlUsd = Number(totalSupply) / 10 ** loanDecimals;
      const borrowedUsd = Number(totalBorrow) / 10 ** loanDecimals;

      const marketMeta = getDemoMarket(publicKey);
      const collateralMint = market.collateralMint.toBase58();
      const loanMint = market.loanMint.toBase58();
      const collateralSymbol =
        marketMeta?.collateralSymbol ?? resolveTokenSymbol(collateralMint);
      const loanSymbol = marketMeta?.loanSymbol ?? resolveTokenSymbol(loanMint);
      const oracleLabel = marketMeta?.oracle ?? "PriceCache (attester EMA)";

      // Decode the on-chain Kalshi ticker bytes — trim NUL padding.
      const tickerBytes = Buffer.from(market.kalshiTicker as number[]);
      const trimmed = tickerBytes.slice(
        0,
        (() => {
          const idx = tickerBytes.indexOf(0);
          return idx === -1 ? tickerBytes.length : idx;
        })()
      );
      const kalshiTicker = trimmed.toString("utf-8");

      return {
        publicKey,
        marketIdHex,
        collateralMint,
        loanMint,
        lltv: Number(market.lltv) / 100,
        baseLltv: Number(market.baseLltv) / 100,
        utilization: utilizationPct,
        supplyApyPct,
        borrowApyPct,
        tvlUsd,
        borrowedUsd,
        paused: market.paused,
        feeBps: Number(market.fee),
        collateralSymbol,
        loanSymbol,
        oracleLabel,
        name:
          marketMeta?.name ??
          (kalshiTicker || `${collateralSymbol} / ${loanSymbol}`),
        id: publicKey,
        resolutionTimestamp: Number(market.resolutionTimestamp),
        marketStatus: Number(market.marketStatus),
        outcomeBit: Number(market.outcomeBit),
        kalshiTicker,
      } satisfies MarketRow;
    })
  );
}

export function useMarkets(pollMs = 30_000) {
  const { connection } = useConnection();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      if (!pendingFetch) {
        pendingFetch = fetchAllMarkets(connection).finally(() => {
          pendingFetch = null;
        });
      }
      const rows = await pendingFetch;
      setMarkets(rows);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[useMarkets]", message);
      setError(message);
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

  return { markets, loading, error, reload: load };
}
