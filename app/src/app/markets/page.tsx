"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DecayCurveChart } from "@/components/DecayCurveChart";
import { ResolutionCountdown } from "@/components/ResolutionCountdown";
import { useMarkets, type MarketRow } from "@/hooks/useMarkets";
import { formatAPY, formatPct, formatUSD } from "@/lib/utils";
import { marketPhase } from "@/lib/copy";

type Filter = "all" | "open" | "last-call" | "settled";

export default function MarketsPage() {
  const { markets, loading } = useMarkets(30_000);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return markets.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        const blob = `${m.name} ${m.kalshiTicker} ${m.collateralSymbol}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (filter === "all") return true;
      const phase = marketPhase(m.resolutionTimestamp, m.marketStatus, now);
      if (filter === "settled") return phase === "settled";
      if (filter === "last-call") return phase === "last-call";
      return phase === "open" || phase === "narrowing" || phase === "closed";
    });
  }, [markets, filter, search]);

  const totalTvl = markets.reduce((s, m) => s + m.tvlUsd, 0);
  const totalBorrowed = markets.reduce((s, m) => s + m.borrowedUsd, 0);
  const avgUtil =
    markets.length > 0
      ? markets.reduce((s, m) => s + m.utilization, 0) / markets.length
      : 0;
  const lastCallCount = markets.filter(
    (m) => marketPhase(m.resolutionTimestamp, m.marketStatus) === "last-call"
  ).length;

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 lg:px-10 md:py-10">
      <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="eyebrow-xs mb-2 inline-block">Markets</span>
          <h1 className="text-[30px] font-extrabold leading-tight text-ink md:text-[40px]">
            Isolated lending pools
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink2 md:text-[15px]">
            Review collateral markets, utilization, APY, and time-decayed
            borrow limits before opening a position.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Open markets", value: loading ? "—" : String(markets.length) },
          { label: "Lending pool", value: loading ? "—" : formatUSD(totalTvl) },
          { label: "Borrowed", value: loading ? "—" : formatUSD(totalBorrowed), accent: "coral" as const },
          { label: "Utilization", value: loading ? "—" : formatPct(avgUtil) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-white p-4">
            <div className="eyebrow-xs mb-2">{s.label}</div>
            <div
              className={`numerals text-[24px] font-bold leading-none md:text-[30px] ${
                s.accent === "coral" ? "text-coral" : "text-ink"
              }`}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Last-call ribbon */}
      {lastCallCount > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-crimson/30 bg-crimson-soft p-4 text-crimson-deep sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="text-[13px] font-bold">
              {lastCallCount} market{lastCallCount > 1 ? "s" : ""} in the final 2-hour window
            </div>
          </div>
          <button
            onClick={() => setFilter("last-call")}
            className="text-[12px] font-bold uppercase tracking-wider underline underline-offset-4 hover:no-underline"
          >
            Show last call
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit gap-1 rounded-lg border border-border bg-white p-1">
          {(
            [
              { key: "all", label: "All" },
              { key: "open", label: "Open" },
              { key: "last-call", label: "Last call" },
              { key: "settled", label: "Settled" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as Filter)}
              className={`rounded-md px-4 py-1.5 text-[12px] font-bold transition-colors ${
                filter === f.key
                  ? f.key === "last-call"
                    ? "bg-crimson text-white"
                    : "bg-ink text-white"
                  : "text-ink2 hover:text-ink hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markets…"
            className="h-10 w-full rounded-lg border border-border bg-white px-4 text-[14px] font-medium text-ink transition-colors placeholder:text-ink4 focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && markets.length === 0 && (
        <div className="py-20 text-center">
          <span className="text-ink3 text-[15px]">Loading markets...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
          <p className="text-ink3">No markets match that filter.</p>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((market) => (
            <MarketTile key={market.publicKey} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketTile({ market }: { market: MarketRow }) {
  const phase = marketPhase(market.resolutionTimestamp, market.marketStatus);
  const isLastCall = phase === "last-call";
  const isSettled = phase === "settled";
  return (
    <Link
      href={`/markets/${market.publicKey}`}
      className={`group block overflow-hidden rounded-lg border bg-white transition-colors hover:border-ink ${
        isLastCall ? "border-crimson/40" : "border-border"
      } ${isSettled ? "opacity-80" : ""}`}
    >
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2.5">
          <Badge variant={isLastCall ? "crimson" : "outline"}>
            {market.collateralSymbol}
          </Badge>
        </div>
        <ResolutionCountdown
          resolutionTimestamp={market.resolutionTimestamp}
          marketStatus={market.marketStatus}
          outcomeBit={market.outcomeBit}
          compact
        />
      </div>

      <div className="px-5 py-5">
        <h3 className="line-clamp-2 min-h-[44px] text-[17px] font-bold leading-[1.25] text-ink transition-colors group-hover:text-coral md:text-[18px]">
          {market.name}
        </h3>
      </div>

      <div className="mx-5 h-20 overflow-hidden rounded-lg border border-border bg-muted/30">
        <DecayCurveChart
          baseLltvBps={Math.round(market.baseLltv * 100)}
          resolutionTimestamp={market.resolutionTimestamp}
          marketStatus={market.marketStatus}
          thumbnail
        />
      </div>

      <div className="grid grid-cols-3 gap-4 p-5">
        <Mini label="Earn" value={formatAPY(market.supplyApyPct)} accent="leaf" />
        <Mini label="Borrow" value={formatAPY(market.borrowApyPct)} accent="coral" />
        <Mini label="Power" value={`${market.lltv.toFixed(0)}%`} />
      </div>

      <div className="border-t border-border px-5 py-3 flex items-center justify-between text-[12px] font-bold text-ink3">
        <span>Pool <span className="numerals text-ink">{formatUSD(market.tvlUsd)}</span></span>
        <span>Used <span className="numerals text-ink">{formatPct(market.utilization)}</span></span>
      </div>
    </Link>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "coral" | "leaf";
}) {
  const c =
    accent === "coral" ? "text-coral" : accent === "leaf" ? "text-leaf" : "text-ink";
  return (
    <div>
      <div className="eyebrow-xs mb-1">{label}</div>
      <div className={`numerals text-[15px] font-extrabold ${c}`}>{value}</div>
    </div>
  );
}
