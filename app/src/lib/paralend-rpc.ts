import { Buffer } from "buffer";

import { getDemoMarket, resolveTokenSymbol } from "./demo-config";
import {
  annualizedPercent,
  bnToBigInt,
  calculateUtilization,
  makeReadonlyProgram,
  irmBorrowRatePerSecond,
} from "./paralend-program";
import { BPS, RPC_ENDPOINT, WAD } from "./constants";

export interface MarketView {
  publicKey: string;
  collateralMint: string;
  loanMint: string;
  collateralSymbol: string;
  loanSymbol: string;
  name: string;
  oracleLabel: string;
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

export async function getAllMarkets(): Promise<MarketView[]> {
  try {
    const program = makeReadonlyProgram();
    const rawMarkets = await program.account.market.all();

    return Promise.all(
      rawMarkets.map(async (entry) => {
        const market = entry.account;
        const publicKey = entry.publicKey.toBase58();
        const totalSupply = bnToBigInt(market.totalSupplyAssets);
        const totalBorrow = bnToBigInt(market.totalBorrowAssets);
        const utilization = calculateUtilization(totalBorrow, totalSupply);

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
          // Keep 0% rates if IRM lookup fails.
        }

        const loanDecimals = market.loanDecimals ?? 6;
        const collateralMint = market.collateralMint.toBase58();
        const loanMint = market.loanMint.toBase58();
        const marketMeta = getDemoMarket(publicKey);
        const collateralSymbol =
          marketMeta?.collateralSymbol ?? resolveTokenSymbol(collateralMint);
        const loanSymbol = marketMeta?.loanSymbol ?? resolveTokenSymbol(loanMint);

        return {
          publicKey,
          collateralMint,
          loanMint,
          collateralSymbol,
          loanSymbol,
          name: marketMeta?.name ?? `${collateralSymbol} / ${loanSymbol}`,
          oracleLabel: marketMeta?.oracle ?? "PriceCache (attester EMA)",
          lltv: Number(market.lltv) / 100,
          feeBps: Number(market.fee),
          totalSupplyAssets: Number(totalSupply),
          totalBorrowAssets: Number(totalBorrow),
          utilization: (Number(utilization) / Number(WAD)) * 100,
          supplyApyPct,
          borrowApyPct,
          tvlUsd: Number(totalSupply) / 10 ** loanDecimals,
          borrowedUsd: Number(totalBorrow) / 10 ** loanDecimals,
          paused: market.paused,
        } satisfies MarketView;
      })
    );
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
    totalBorrowedUsd: markets.reduce((sum, market) => sum + market.borrowedUsd, 0),
    avgUtilization:
      markets.reduce((sum, market) => sum + market.utilization, 0) /
      markets.length,
  };
}

export function getRpcEndpoint() {
  return RPC_ENDPOINT;
}
