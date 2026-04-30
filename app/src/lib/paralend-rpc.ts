import { Buffer } from "buffer";

import { getRegistryMarket, resolveTokenSymbol } from "./market-registry";
import {
  getLiveDflowMarketMeta,
  liveDflowDisplayName,
} from "./live-market-meta";
import { computeEffectiveLltvBps } from "./decay";
import { marketPhase, marketPhaseRank } from "./copy";
import {
  annualizedPercent,
  bnToBigInt,
  calculateUtilization,
  computeMarketIdFromAccount,
  irmBorrowRatePerSecond,
  makeReadonlyProgram,
} from "./paralend-program";
import { BPS, RPC_ENDPOINT, WAD } from "./constants";

/**
 * Server-side market shape.
 *
 * Important: this must stay structurally compatible with MarketRow (the
 * client-side hook in useMarkets.ts) so the same component can render a market
 * regardless of whether it came from SSR or a client-side poll.
 */
export interface MarketView {
  publicKey: string;
  marketIdHex: string;
  collateralMint: string;
  loanMint: string;
  collateralSymbol: string;
  loanSymbol: string;
  name: string;
  oracleLabel: string;
  lltv: number;
  baseLltv: number;
  feeBps: number;
  totalSupplyAssets: number;
  totalBorrowAssets: number;
  utilization: number;
  supplyApyPct: number;
  borrowApyPct: number;
  tvlUsd: number;
  borrowedUsd: number;
  paused: boolean;
  resolutionTimestamp: number;
  marketStatus: number;
  outcomeBit: number;
  kalshiTicker: string;
  id: string;
  isRegistryMarket: boolean;
  hasLiveMetadata: boolean;
}

export interface ProtocolStats {
  marketCount: number;
  totalTvlUsd: number;
  totalBorrowedUsd: number;
  avgUtilization: number;
}

export async function getAllMarkets(): Promise<MarketView[]> {
  try {
    const program = makeReadonlyProgram();
    const rawMarkets = await program.account.market.all();

    const rows = await Promise.all(
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
          const irm = await (program.account as any).linearIrm.fetch(
            market.irm
          );
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
          // Rates stay at 0 if IRM lookup fails.
        }

        const loanDecimals = market.loanDecimals ?? 6;
        const collateralMint = market.collateralMint.toBase58();
        const loanMint = market.loanMint.toBase58();
        const marketMeta = getRegistryMarket(publicKey);
        const collateralSymbol =
          marketMeta?.collateralSymbol ?? resolveTokenSymbol(collateralMint);
        const loanSymbol =
          marketMeta?.loanSymbol ?? resolveTokenSymbol(loanMint);

        const tickerBytes = Buffer.from(market.kalshiTicker as number[]);
        const idx = tickerBytes.indexOf(0);
        const trimmed = tickerBytes.slice(
          0,
          idx === -1 ? tickerBytes.length : idx
        );
        const kalshiTicker = trimmed.toString("utf-8");
        const liveMeta = kalshiTicker
          ? await getLiveDflowMarketMeta(kalshiTicker)
          : null;
        const liveName = liveDflowDisplayName(liveMeta, collateralSymbol);

        const effectiveLltvBps = computeEffectiveLltvBps(
          Number(market.baseLltv ?? market.lltv),
          Number(market.resolutionTimestamp ?? 0),
          Math.floor(Date.now() / 1000)
        );
        const lltvPct = effectiveLltvBps / 100;
        const baseLltvPct = Number(market.baseLltv ?? market.lltv) / 100;
        const tvlUsd = Number(totalSupply) / 10 ** loanDecimals;
        const borrowedUsd = Number(totalBorrow) / 10 ** loanDecimals;

        return {
          publicKey,
          marketIdHex,
          collateralMint,
          loanMint,
          collateralSymbol,
          loanSymbol,
          name:
            liveName ??
            marketMeta?.name ??
            (kalshiTicker || `${collateralSymbol} / ${loanSymbol}`),
          oracleLabel: marketMeta?.oracle ?? "DFlow live bid (attested EMA)",
          lltv: lltvPct,
          baseLltv: baseLltvPct,
          feeBps: Number(market.fee),
          totalSupplyAssets: Number(totalSupply),
          totalBorrowAssets: Number(totalBorrow),
          utilization: utilizationPct,
          supplyApyPct,
          borrowApyPct,
          tvlUsd,
          borrowedUsd,
          paused: market.paused,
          resolutionTimestamp: Number(market.resolutionTimestamp ?? 0),
          marketStatus: Number(market.marketStatus ?? 0),
          outcomeBit: Number(market.outcomeBit ?? 0),
          kalshiTicker,
          id: publicKey,
          isRegistryMarket: Boolean(marketMeta),
          hasLiveMetadata: Boolean(liveMeta),
        } satisfies MarketView;
      })
    );
    const now = Math.floor(Date.now() / 1000);
    return rows
      .filter((row) => row.hasLiveMetadata || row.isRegistryMarket)
      .sort((a, b) => {
        const phaseDelta =
          marketPhaseRank(
            marketPhase(a.resolutionTimestamp, a.marketStatus, now)
          ) -
          marketPhaseRank(
            marketPhase(b.resolutionTimestamp, b.marketStatus, now)
          );
        if (phaseDelta !== 0) return phaseDelta;
        return a.resolutionTimestamp - b.resolutionTimestamp;
      });
  } catch (err) {
    console.error("[paralend-rpc] getAllMarkets failed:", err);
    return [];
  }
}

export async function getProtocolStats(): Promise<ProtocolStats> {
  const markets = await getAllMarkets();
  if (markets.length === 0) {
    return {
      marketCount: 0,
      totalTvlUsd: 0,
      totalBorrowedUsd: 0,
      avgUtilization: 0,
    };
  }

  return {
    marketCount: markets.length,
    totalTvlUsd: markets.reduce((sum, market) => sum + market.tvlUsd, 0),
    totalBorrowedUsd: markets.reduce(
      (sum, market) => sum + market.borrowedUsd,
      0
    ),
    avgUtilization:
      markets.reduce((sum, market) => sum + market.utilization, 0) /
      markets.length,
  };
}

export function getRpcEndpoint() {
  return RPC_ENDPOINT;
}
