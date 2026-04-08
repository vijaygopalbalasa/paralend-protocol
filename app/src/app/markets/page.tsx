"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
          <h1 className="text-2xl font-bold text-nucleus-text-primary">Markets</h1>
          <p className="text-sm text-nucleus-text-secondary mt-1">
            All permissionless lending markets on Nucleus.
          </p>
        </div>
        <Link href="/create">
          <Button variant="primary" size="md">
            + Create Market
          </Button>
        </Link>
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
            className="rounded-xl border border-nucleus-border bg-nucleus-card px-4 py-3"
          >
            <div className="text-xs text-nucleus-text-secondary uppercase tracking-wide mb-1">
              {s.label}
            </div>
            <div className="text-lg font-bold text-nucleus-text-primary tabular-nums">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && markets.length === 0 && (
        <div className="flex items-center justify-center py-16 text-nucleus-text-secondary text-sm animate-pulse">
          Loading markets from devnet…
        </div>
      )}

      {/* No markets yet */}
      {!loading && markets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-xl border border-nucleus-border border-dashed">
          <p className="text-nucleus-text-secondary text-sm">
            No markets found on devnet yet.
          </p>
          <Link href="/create">
            <Button variant="primary">Create the first market</Button>
          </Link>
        </div>
      )}

      {/* Markets table — desktop */}
      {markets.length > 0 && (
        <div className="hidden md:block rounded-xl border border-nucleus-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-nucleus-card border-b border-nucleus-border">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                  Market
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                  LLTV
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                  Supply APY
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                  Borrow APY
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                  TVL
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                  Utilization
                </th>
                <th className="text-right py-3 px-5 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-nucleus-bg divide-y divide-nucleus-border/50">
              {markets.map((market) => (
                <tr
                  key={market.publicKey}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  {/* Market name */}
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nucleus-card border border-nucleus-border text-sm font-bold text-nucleus-text-secondary">
                          {market.collateralSymbol.slice(0, 2)}
                        </span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nucleus-card border border-nucleus-border text-sm">
                          $
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-nucleus-text-primary">
                          {market.collateralSymbol} / {market.loanSymbol}
                        </div>
                        <div className="text-xs text-nucleus-text-secondary font-mono">
                          {market.publicKey.slice(0, 8)}…
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* LLTV */}
                  <td className="py-4 px-4 text-right">
                    <Badge variant="gray">{market.lltv}%</Badge>
                  </td>

                  {/* Supply APY */}
                  <td className="py-4 px-4 text-right">
                    <span className="font-semibold text-nucleus-green tabular-nums">
                      {formatAPY(market.supplyApyPct)}
                    </span>
                  </td>

                  {/* Borrow APY */}
                  <td className="py-4 px-4 text-right">
                    <span className="font-semibold text-nucleus-orange tabular-nums">
                      {formatAPY(market.borrowApyPct)}
                    </span>
                  </td>

                  {/* TVL */}
                  <td className="py-4 px-4 text-right">
                    <span className="font-medium text-nucleus-text-primary tabular-nums">
                      {formatUSD(market.tvlUsd)}
                    </span>
                  </td>

                  {/* Utilization */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <div className="flex-1 h-1.5 rounded-full bg-nucleus-border overflow-hidden">
                        <div
                          className={`h-full rounded-full ${utilizationColor(market.utilization)}`}
                          style={{ width: `${Math.min(market.utilization, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-nucleus-text-secondary tabular-nums w-8 text-right">
                        {market.utilization.toFixed(0)}%
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/markets/${market.publicKey}?tab=supply`}>
                        <Button variant="secondary" size="sm">
                          Supply
                        </Button>
                      </Link>
                      <Link href={`/markets/${market.publicKey}?tab=borrow`}>
                        <Button variant="primary" size="sm">
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
        <div className="flex flex-col gap-3 md:hidden">
          {markets.map((market) => (
            <div
              key={market.publicKey}
              className="rounded-xl border border-nucleus-border bg-nucleus-card p-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-nucleus-text-primary">
                    {market.collateralSymbol} / {market.loanSymbol}
                  </span>
                </div>
                <Badge variant="gray">{market.lltv}% LLTV</Badge>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-xs text-nucleus-text-secondary mb-0.5">Supply APY</div>
                  <div className="font-semibold text-nucleus-green">{formatAPY(market.supplyApyPct)}</div>
                </div>
                <div>
                  <div className="text-xs text-nucleus-text-secondary mb-0.5">Borrow APY</div>
                  <div className="font-semibold text-nucleus-orange">{formatAPY(market.borrowApyPct)}</div>
                </div>
                <div>
                  <div className="text-xs text-nucleus-text-secondary mb-0.5">TVL</div>
                  <div className="font-medium text-nucleus-text-primary">{formatUSD(market.tvlUsd)}</div>
                </div>
                <div>
                  <div className="text-xs text-nucleus-text-secondary mb-0.5">Utilization</div>
                  <div className="font-medium text-nucleus-text-primary">{formatPct(market.utilization)}</div>
                </div>
              </div>

              {/* Utilization bar */}
              <div className="h-1.5 w-full rounded-full bg-nucleus-border overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full ${utilizationColor(market.utilization)}`}
                  style={{ width: `${Math.min(market.utilization, 100)}%` }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Link href={`/markets/${market.publicKey}?tab=supply`} className="flex-1">
                  <Button variant="secondary" size="sm" fullWidth>
                    Supply
                  </Button>
                </Link>
                <Link href={`/markets/${market.publicKey}?tab=borrow`} className="flex-1">
                  <Button variant="primary" size="sm" fullWidth>
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
