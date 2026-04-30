"use client";

import { useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import {
  getRegistryMarket,
  resolveTokenIcon,
  resolveTokenSymbol,
} from "@/lib/market-registry";
import {
  fetchLiveDflowMarketMeta,
  liveDflowDisplayName,
} from "@/lib/live-market-client";
import { computeEffectiveLltvBps } from "@/lib/decay";
import {
  annualizedPercent,
  bnToBigInt,
  calculateHealthFactor,
  calculateUtilization,
  computeMarketIdFromAccount,
  derivePositionPDA,
  derivePriceCachePDA,
  getProgramId,
  getTokenBalance,
  irmBorrowRatePerSecond,
  makeReadonlyProgram,
  toAssetsDown,
  toAssetsUp,
} from "@/lib/paralend-program";
import { BPS, WAD } from "@/lib/constants";

export interface MarketDetail {
  publicKey: string;
  name: string;
  marketId: Buffer;
  marketIdHex: string;
  collateralMint: PublicKey;
  loanMint: PublicKey;
  irm: PublicKey;
  collateralOracleFeedId: Buffer;
  loanOracleFeedId: Buffer;
  collateralMintStr: string;
  loanMintStr: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralIcon: string;
  loanIcon: string;
  collateralDecimals: number;
  loanDecimals: number;
  lltv: number;
  baseLltvBps: number;
  feeBps: number;
  paused: boolean;
  oracleLabel: string;
  /** Kalshi market ticker, trimmed from zero-padding. */
  kalshiTicker: string;
  /** Unix seconds. 0 = classical lending market (no time-decay). */
  resolutionTimestamp: number;
  /** 0 Active, 1 PreResolution, 2 Resolved. */
  marketStatus: number;
  /** 0 unresolved, 1 YES won, 2 NO won. */
  outcomeBit: number;
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  tvlUsd: number;
  borrowedUsd: number;
  utilization: number;
  supplyApyPct: number;
  borrowApyPct: number;
  collateralPriceWad: bigint;
  loanPriceWad: bigint;
  collateralPriceUsd: number;
  loanPriceUsd: number;
  position: {
    publicKey: string | null;
    exists: boolean;
    supplyShares: bigint;
    supplyAssets: bigint;
    borrowShares: bigint;
    borrowAssets: bigint;
    collateralAmount: bigint;
    collateralValueUsd: number;
    healthFactor: number;
  };
  walletBalances: {
    loan: bigint;
    collateral: bigint;
  };
}

export function useMarketDetail(marketAddress: string | null, pollMs = 15_000) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    if (!marketAddress) {
      setMarket(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const marketKey = new PublicKey(marketAddress);
      const marketMeta = getRegistryMarket(marketAddress);
      const program = makeReadonlyProgram(connection, getProgramId());
      const account = await program.account.market.fetch(marketKey);
      const irm = await (program.account as any).linearIrm.fetch(account.irm);
      const marketId = computeMarketIdFromAccount(account);
      const marketIdHex = marketId.toString("hex");
      const collateralMint = account.collateralMint as PublicKey;
      const loanMint = account.loanMint as PublicKey;
      const collateralOracleFeedId = Buffer.from(
        account.collateralOracleFeedId as number[]
      );
      const loanOracleFeedId = Buffer.from(
        account.loanOracleFeedId as number[]
      );
      const collateralMintStr = collateralMint.toBase58();
      const loanMintStr = loanMint.toBase58();
      const collateralSymbol = resolveTokenSymbol(collateralMintStr);
      const loanSymbol = resolveTokenSymbol(loanMintStr);
      const collateralIcon = resolveTokenIcon(collateralMintStr);
      const loanIcon = resolveTokenIcon(loanMintStr);
      const collateralDecimals = account.collateralDecimals ?? 9;
      const loanDecimals = account.loanDecimals ?? 6;
      const totalSupplyAssets = bnToBigInt(account.totalSupplyAssets);
      const totalSupplyShares = bnToBigInt(account.totalSupplyShares);
      const totalBorrowAssets = bnToBigInt(account.totalBorrowAssets);
      const totalBorrowShares = bnToBigInt(account.totalBorrowShares);
      const effectiveLltvBps = computeEffectiveLltvBps(
        Number(account.baseLltv ?? account.lltv),
        Number(account.resolutionTimestamp ?? 0),
        Math.floor(Date.now() / 1000)
      );
      const utilization = calculateUtilization(
        totalBorrowAssets,
        totalSupplyAssets
      );
      const borrowRate = irmBorrowRatePerSecond(
        utilization,
        bnToBigInt(irm.baseRate),
        bnToBigInt(irm.slope1),
        bnToBigInt(irm.slope2),
        bnToBigInt(irm.kink)
      );
      const borrowApyPct = annualizedPercent(borrowRate);
      const supplyApyPct =
        borrowApyPct *
        (Number(utilization) / Number(WAD)) *
        (1 - Number(account.fee) / Number(BPS));

      // Collateral price comes from the per-market PriceCache (EMA of
      // attester-pushed Kalshi/DFlow spots). Best-effort read: if the cache
      // hasn't been registered yet (freshly-created markets), surface 0 so
      // the UI can render a "pending attestation" state rather than crash.
      const priceCachePda = derivePriceCachePDA(marketId);
      let collateralPriceWad = 0n;
      try {
        const cacheAccount = await (program.account as any).priceCache.fetch(
          priceCachePda
        );
        collateralPriceWad = bnToBigInt(cacheAccount.emaPriceWad);
      } catch {
        collateralPriceWad = 0n;
      }

      // Loan side is USDC for Paralend — always $1 per full token.
      const loanPriceWad = WAD / 10n ** BigInt(loanDecimals);

      let position = {
        publicKey: null as string | null,
        exists: false,
        supplyShares: 0n,
        supplyAssets: 0n,
        borrowShares: 0n,
        borrowAssets: 0n,
        collateralAmount: 0n,
        collateralValueUsd: 0,
        healthFactor: Infinity,
      };
      let walletBalances = { loan: 0n, collateral: 0n };

      if (publicKey) {
        const positionPda = derivePositionPDA(marketId, publicKey);
        const positionInfo = await connection.getAccountInfo(positionPda);
        if (positionInfo) {
          const positionAccount = await program.account.position.fetch(
            positionPda
          );
          const supplyShares = bnToBigInt(positionAccount.supplyShares);
          const borrowShares = bnToBigInt(positionAccount.borrowShares);
          const collateralAmount = bnToBigInt(positionAccount.collateral);
          const supplyAssets =
            supplyShares > 0n
              ? toAssetsDown(supplyShares, totalSupplyAssets, totalSupplyShares)
              : 0n;
          const borrowAssets =
            borrowShares > 0n
              ? toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)
              : 0n;

          position = {
            publicKey: positionPda.toBase58(),
            exists: true,
            supplyShares,
            supplyAssets,
            borrowShares,
            borrowAssets,
            collateralAmount,
            collateralValueUsd:
              Number((collateralAmount * collateralPriceWad) / WAD) /
              10 ** collateralDecimals,
            healthFactor: calculateHealthFactor({
              collateral: collateralAmount,
              borrowShares,
              totalBorrowAssets,
              totalBorrowShares,
              lltv: BigInt(effectiveLltvBps),
              collateralPriceWad,
              loanPriceWad,
            }),
          };
        }

        const [loanBalance, collateralBalance] = await Promise.all([
          getTokenBalance(connection, loanMint, publicKey),
          getTokenBalance(connection, collateralMint, publicKey),
        ]);
        walletBalances = {
          loan: loanBalance,
          collateral: collateralBalance,
        };
      }

      const kalshiTicker = (() => {
        const buf = Buffer.from(account.kalshiTicker as number[]);
        const idx = buf.indexOf(0);
        return buf.slice(0, idx === -1 ? buf.length : idx).toString("utf-8");
      })();
      const liveMeta = kalshiTicker
        ? await fetchLiveDflowMarketMeta(kalshiTicker)
        : null;
      const liveName = liveDflowDisplayName(liveMeta, collateralSymbol);

      setMarket({
        publicKey: marketAddress,
        name:
          liveName ??
          marketMeta?.name ??
          (kalshiTicker || `${collateralSymbol} / ${loanSymbol}`),
        marketId,
        marketIdHex,
        collateralMint,
        loanMint,
        irm: account.irm as PublicKey,
        collateralOracleFeedId,
        loanOracleFeedId,
        collateralMintStr,
        loanMintStr,
        collateralSymbol,
        loanSymbol,
        collateralIcon,
        loanIcon,
        collateralDecimals,
        loanDecimals,
        lltv: effectiveLltvBps / 100,
        baseLltvBps: Number(account.baseLltv),
        feeBps: Number(account.fee),
        paused: account.paused,
        oracleLabel: marketMeta?.oracle ?? "DFlow live bid (attested EMA)",
        kalshiTicker,
        resolutionTimestamp: Number(account.resolutionTimestamp),
        marketStatus: Number(account.marketStatus),
        outcomeBit: Number(account.outcomeBit),
        totalSupplyAssets,
        totalSupplyShares,
        totalBorrowAssets,
        totalBorrowShares,
        tvlUsd: Number(totalSupplyAssets) / 10 ** loanDecimals,
        borrowedUsd: Number(totalBorrowAssets) / 10 ** loanDecimals,
        utilization: (Number(utilization) / Number(WAD)) * 100,
        supplyApyPct,
        borrowApyPct,
        collateralPriceWad,
        loanPriceWad,
        collateralPriceUsd:
          Number(collateralPriceWad * 10n ** BigInt(collateralDecimals)) /
          Number(WAD),
        loanPriceUsd:
          Number(loanPriceWad * 10n ** BigInt(loanDecimals)) / Number(WAD),
        position,
        walletBalances,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMarket(null);
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
  }, [connection, publicKey?.toBase58(), marketAddress]);

  return { market, loading, error, reload: load };
}
