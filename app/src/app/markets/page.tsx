"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResolutionCountdown } from "@/components/ResolutionCountdown";
import { formatUSD, formatAPY, formatPct, utilizationColor } from "@/lib/utils";
import { useMarkets } from "@/hooks/useMarkets";

export default function MarketsPage() {
  const { markets, loading } = useMarkets(30_000);

  const totalTvl = markets.reduce((s, m) => s + m.tvlUsd, 0);
  const totalBorrowed = markets.reduce((s, m) => s + m.borrowedUsd, 0);
  const avgUtil =
    markets.length > 0
      ? markets.reduce((s, m) => s + m.utilization, 0) / markets.length
      : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-paralend-text-primary">Markets</h1>
          <p className="text-sm text-paralend-text-secondary mt-1">
            Borrow USDC against tokenized Kalshi positions. Time-decay LLTV
            tightens as each event approaches resolution.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Markets", value: loading ? "…" : String(markets.length) },
          { label: "Total TVL", value: loading ? "…" : formatUSD(totalTvl) },
          { label: "Total Borrowed", value: loading ? "…" : formatUSD(totalBorrowed) },
          { label: "Avg Utilization", value: loading ? "…" : formatPct(avgUtil) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-paralend-border bg-paralend-card px-4 py-3"
          >
            <div className="text-xs text-paralend-text-secondary uppercase tracking-wide mb-1">
              {s.label}
            </div>
            <div className="text-lg font-bold text-paralend-text-primary tabular-nums">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && markets.length === 0 && (
        <div className="flex items-center justify-center py-16 text-paralend-text-secondary text-sm animate-pulse">
          Loading markets from devnet…
        </div>
      )}

      {/* No markets yet */}
      {!loading && markets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-xl border border-paralend-border border-dashed">
          <p className="text-paralend-text-secondary text-sm">
            No markets found on devnet yet.
          </p>
          <Link href="/create">
            <Button variant="primary">Create the first market</Button>
          </Link>
        </div>
      )}

      {/* Markets table — desktop */}
      {markets.length > 0 && (
        <div className="hidden md:block rounded-xl border border-paralend-border shadow-sm bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFA] border-b border-paralend-border">
              <tr>
                <th className="text-left py-4 px-6 text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
                  Market
                </th>
                <th className="text-right py-4 px-5 text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
                  LLTV
                </th>
                <th className="text-right py-4 px-5 text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
                  Supply APY
                </th>
                <th className="text-right py-4 px-5 text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
                  Borrow APY
                </th>
                <th className="text-right py-4 px-5 text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
                  TVL
                </th>
                <th className="text-left py-4 px-5 text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
                  Utilization
                </th>
                <th className="text-right py-4 px-6 text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paralend-border">
              {markets.map((market) => (
                <tr
                  key={market.publicKey}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Market name */}
                  <td className="py-5 px-6">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1 shadow-sm rounded-full">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-paralend-border text-sm font-bold text-paralend-text-secondary z-10">
                          {market.collateralSymbol.slice(0, 2)}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FAFAFA] border border-paralend-border text-xs text-gray-400">
                          $
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-paralend-text-primary tracking-tight truncate max-w-[200px]">
                          {market.kalshiTicker || `${market.collateralSymbol} / ${market.loanSymbol}`}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ResolutionCountdown
                            resolutionTimestamp={market.resolutionTimestamp}
                            marketStatus={market.marketStatus}
                            outcomeBit={market.outcomeBit}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* LLTV */}
                  <td className="py-5 px-5 text-right">
                    <Badge variant="gray">{market.lltv}%</Badge>
                  </td>

                  {/* Supply APY */}
                  <td className="py-5 px-5 text-right">
                    <span className="font-black text-paralend-green tabular-nums">
                      {formatAPY(market.supplyApyPct)}
                    </span>
                  </td>

                  {/* Borrow APY */}
                  <td className="py-5 px-5 text-right">
                    <span className="font-black text-paralend-orange tabular-nums">
                      {formatAPY(market.borrowApyPct)}
                    </span>
                  </td>

                  {/* TVL */}
                  <td className="py-5 px-5 text-right">
                    <span className="font-bold text-paralend-text-primary tabular-nums">
                      {formatUSD(market.tvlUsd)}
                    </span>
                  </td>

                  {/* Utilization */}
                  <td className="py-5 px-5">
                    <div className="flex items-center gap-3 max-w-[140px]">
                      <div className="flex-1 h-2 rounded-full bg-[#FAFAFA] overflow-hidden border border-paralend-border/50">
                        <div
                          className={`h-full rounded-full ${utilizationColor(market.utilization)}`}
                          style={{ width: `${Math.min(market.utilization, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-paralend-text-secondary tabular-nums w-8 text-right">
                        {market.utilization.toFixed(0)}%
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-5 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/markets/${market.publicKey}?tab=supply`}>
                        <Button variant="secondary" size="sm" className="font-bold">
                          Supply
                        </Button>
                      </Link>
                      <Link href={`/markets/${market.publicKey}?tab=borrow`}>
                        <Button variant="primary" size="sm" className="font-bold">
                          Borrow
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Markets cards — mobile */}
      {markets.length > 0 && (
        <div className="flex flex-col gap-4 md:hidden">
          {markets.map((market) => (
            <div
              key={market.publicKey}
              className="rounded-xl border border-paralend-border bg-white p-5 shadow-sm"
            >
              {/* Header */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-paralend-text-primary tracking-tight truncate">
                    {market.kalshiTicker || `${market.collateralSymbol} / ${market.loanSymbol}`}
                  </span>
                  <Badge variant="gray">{market.lltv}% LLTV</Badge>
                </div>
                <ResolutionCountdown
                  resolutionTimestamp={market.resolutionTimestamp}
                  marketStatus={market.marketStatus}
                  outcomeBit={market.outcomeBit}
                  compact
                />
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4 mb-4 bg-[#FAFAFA] p-3 rounded-lg border border-paralend-border/50">
                <div>
                  <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-0.5">Supply APY</div>
                  <div className="font-black text-paralend-green">{formatAPY(market.supplyApyPct)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-0.5">Borrow APY</div>
                  <div className="font-black text-paralend-orange">{formatAPY(market.borrowApyPct)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-0.5">TVL</div>
                  <div className="font-bold text-paralend-text-primary tabular-nums">{formatUSD(market.tvlUsd)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-0.5">Utilization</div>
                  <div className="font-bold text-paralend-text-primary tabular-nums">{formatPct(market.utilization)}</div>
                </div>
              </div>

              {/* Utilization bar */}
              <div className="h-2 w-full rounded-full bg-[#FAFAFA] border border-paralend-border/50 overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full ${utilizationColor(market.utilization)}`}
                  style={{ width: `${Math.min(market.utilization, 100)}%` }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Link href={`/markets/${market.publicKey}?tab=supply`} className="flex-1">
                  <Button variant="secondary" size="md" fullWidth className="font-bold">
                    Supply
                  </Button>
                </Link>
                <Link href={`/markets/${market.publicKey}?tab=borrow`} className="flex-1">
                  <Button variant="primary" size="md" fullWidth className="font-bold">
                    Borrow
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
