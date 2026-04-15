"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatUSD, formatHealthFactor, healthFactorBg } from "@/lib/utils";
import { usePositions } from "@/hooks/usePositions";
import { formatTokenAmount } from "@/lib/nucleus-program";

export default function PositionsPage() {
  const { publicKey, connected } = useWallet();
  const { positions, loading } = usePositions(15_000);

  const totalSupplied = positions.reduce((s, p) => s + p.supplyAssetsUsd, 0);
  const totalBorrowed = positions.reduce((s, p) => s + p.borrowAssetsUsd, 0);
  const totalCollateral = positions.reduce((s, p) => s + p.collateralValueUsd, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nucleus-text-primary">My Positions</h1>
          <p className="text-sm text-nucleus-text-secondary mt-1">
            All your active lending and borrowing positions across every market.
          </p>
        </div>
        <Link href="/markets">
          <Button variant="primary" size="sm">
            + Open Position
          </Button>
        </Link>
      </div>

      {/* Not connected */}
      {!connected && (
        <div className="flex flex-col items-center justify-center py-24 gap-5 rounded-xl border border-nucleus-border border-dashed bg-nucleus-card/30">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-nucleus-card border border-nucleus-border text-3xl">
            ◎
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-nucleus-text-primary mb-1">
              Connect your wallet
            </h3>
            <p className="text-sm text-nucleus-text-secondary max-w-xs">
              Connect a Solana wallet (Phantom, Solflare, Backpack) to view your positions.
            </p>
          </div>
          <Link href="/markets">
            <Button variant="primary">Explore Markets</Button>
          </Link>
        </div>
      )}

      {/* Connected, loading */}
      {connected && loading && positions.length === 0 && (
        <div className="flex items-center justify-center py-16 text-nucleus-text-secondary text-sm animate-pulse">
          Loading positions from devnet…
        </div>
      )}

      {/* Connected, no positions */}
      {connected && !loading && positions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-5 rounded-xl border border-nucleus-border border-dashed bg-nucleus-card/30">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-nucleus-card border border-nucleus-border text-3xl">
            ◎
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-nucleus-text-primary mb-1">
              No positions yet
            </h3>
            <p className="text-sm text-nucleus-text-secondary max-w-xs">
              Explore markets to start supplying or borrowing.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/markets">
              <Button variant="primary">Explore Markets</Button>
            </Link>
            <Link href="/create">
              <Button variant="secondary">Create Market</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {positions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Supplied", value: formatUSD(totalSupplied) },
            { label: "Total Borrowed", value: formatUSD(totalBorrowed) },
            { label: "Total Collateral", value: formatUSD(totalCollateral) },
            { label: "Positions", value: String(positions.length) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-nucleus-border bg-nucleus-card px-4 py-3"
            >
              <div className="text-xs text-nucleus-text-secondary uppercase tracking-wide mb-1">
                {stat.label}
              </div>
              <div className="text-lg font-bold text-nucleus-text-primary tabular-nums">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Positions table — desktop */}
      {positions.length > 0 && (
        <>
          <div className="hidden md:block rounded-xl border border-nucleus-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-nucleus-card border-b border-nucleus-border">
                <tr>
                  <th className="text-left py-3 px-5 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                    Market
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                    Supplied
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                    Borrowed
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                    Collateral
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                    Health Factor
                  </th>
                  <th className="text-right py-3 px-5 text-xs font-semibold text-nucleus-text-secondary uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-nucleus-bg divide-y divide-nucleus-border/50">
                {positions.map((pos) => (
                  <tr key={pos.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-1">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nucleus-card border border-nucleus-border text-sm font-bold text-nucleus-text-secondary">
                            {pos.collateralSymbol.slice(0, 2)}
                          </span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nucleus-card border border-nucleus-border text-sm">
                            $
                          </span>
                        </div>
                        <span className="font-semibold text-nucleus-text-primary">
                          {pos.collateralSymbol} / {pos.loanSymbol}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-right">
                      <div className="text-nucleus-green font-semibold">
                        {pos.supplyAssetsUsd > 0 ? formatUSD(pos.supplyAssetsUsd) : "—"}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-right">
                      <div className={pos.borrowAssetsUsd > 0 ? "text-nucleus-orange font-semibold" : "text-nucleus-text-secondary"}>
                        {pos.borrowAssetsUsd > 0 ? formatUSD(pos.borrowAssetsUsd) : "—"}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-right">
                      <div className="font-semibold text-nucleus-text-primary">
                        {Number(pos.collateralAmount) > 0
                          ? `${formatTokenAmount(pos.collateralAmount, pos.collateralDecimals, 4)} ${pos.collateralSymbol}`
                          : "—"}
                      </div>
                      {pos.collateralValueUsd > 0 && (
                        <div className="text-xs text-nucleus-text-secondary">
                          ≈ {formatUSD(pos.collateralValueUsd)}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right">
                      {pos.borrowAssetsUsd > 0 ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-bold ${healthFactorBg(pos.healthFactor)}`}
                        >
                          {formatHealthFactor(pos.healthFactor)}
                        </span>
                      ) : (
                        <span className="text-nucleus-text-secondary text-sm">—</span>
                      )}
                    </td>

                    <td className="py-4 px-5 text-right">
                      <Link href={`/markets/${pos.marketPubkey}`}>
                        <Button variant="secondary" size="sm">
                          Manage
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="rounded-xl border border-nucleus-border bg-nucleus-card p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-nucleus-text-primary text-sm">
                    {pos.collateralSymbol} / {pos.loanSymbol}
                  </span>
                  {pos.borrowAssetsUsd > 0 && (
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${healthFactorBg(pos.healthFactor)}`}
                    >
                      HF: {formatHealthFactor(pos.healthFactor)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div>
                    <div className="text-xs text-nucleus-text-secondary mb-0.5">Supplied</div>
                    <div className="font-semibold text-nucleus-green">
                      {pos.supplyAssetsUsd > 0 ? formatUSD(pos.supplyAssetsUsd) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-nucleus-text-secondary mb-0.5">Borrowed</div>
                    <div className={`font-semibold ${pos.borrowAssetsUsd > 0 ? "text-nucleus-orange" : "text-nucleus-text-secondary"}`}>
                      {pos.borrowAssetsUsd > 0 ? formatUSD(pos.borrowAssetsUsd) : "—"}
                    </div>
                  </div>
                </div>
                <Link href={`/markets/${pos.marketPubkey}`}>
                  <Button variant="secondary" size="sm" fullWidth>
                    Manage Position
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Health Factor legend */}
      {positions.length > 0 && (
        <Card>
          <div className="flex flex-wrap gap-4 text-xs text-nucleus-text-secondary">
            <span className="font-semibold text-nucleus-text-primary text-sm">
              Health Factor guide:
            </span>
            {[
              { label: "> 1.5 — Safe", hf: 2 },
              { label: "1.1–1.5 — Caution", hf: 1.3 },
              { label: "< 1.1 — Liquidatable", hf: 0.9 },
            ].map(({ label, hf }) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded border font-bold ${healthFactorBg(hf)}`}
                >
                  {formatHealthFactor(hf)}
                </span>
                {label.split(" — ")[1]}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
