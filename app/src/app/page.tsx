import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DecayCurveChart } from "@/components/DecayCurveChart";
import { ResolutionCountdown } from "@/components/ResolutionCountdown";
import { getAllMarkets, getProtocolStats } from "@/lib/paralend-rpc";
import { marketPhase } from "@/lib/copy";
import { formatAPY, formatPct, formatUSD } from "@/lib/utils";

export const revalidate = 30;

export default async function HomePage() {
  const [stats, markets] = await Promise.all([
    getProtocolStats(),
    getAllMarkets(),
  ]);
  const featured = markets.slice(0, 4);
  const now = Math.floor(Date.now() / 1000);
  const lastCallCount = markets.filter(
    (m) => marketPhase(m.resolutionTimestamp, m.marketStatus, now) === "last-call"
  ).length;

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 lg:px-10 md:py-10">
      <section className="mb-6 flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow-xs mb-2">Paralend / Devnet</div>
          <h1 className="text-[30px] font-extrabold leading-tight text-ink md:text-[40px]">
            Prediction-market credit
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink2 md:text-[15px]">
            Isolated lending markets for tokenized YES/NO positions. Supply
            stablecoin, post prediction collateral, borrow against current
            effective LLTV, and manage settlement risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/markets">
            <Button size="md" variant="primary">Open markets</Button>
          </Link>
          <Link href="/positions">
            <Button size="md" variant="secondary">Portfolio</Button>
          </Link>
        </div>
      </section>

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Markets" value={String(stats.marketCount)} />
        <Metric label="Supplied" value={formatUSD(stats.totalTvlUsd)} />
        <Metric label="Borrowed" value={formatUSD(stats.totalBorrowedUsd)} />
        <Metric label="Utilization" value={formatPct(stats.avgUtilization)} />
      </section>

      {lastCallCount > 0 && (
        <section className="mb-6 rounded-lg border border-crimson/30 bg-crimson-soft px-4 py-3 text-[13px] text-crimson-deep">
          <div className="font-bold">
            {lastCallCount} market{lastCallCount > 1 ? "s are" : " is"} in the final
            two-hour settlement window.
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow-xs mb-1">Markets</div>
              <h2 className="text-[20px] font-extrabold text-ink">
                Active collateral pools
              </h2>
            </div>
            <Link href="/markets">
              <Button size="sm" variant="secondary">View all</Button>
            </Link>
          </div>

          {featured.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {featured.map((market) => (
                <MarketRow key={market.publicKey} market={market} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center text-[14px] text-ink3">
              No markets found on devnet.
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-border bg-white p-5">
          <div className="eyebrow-xs mb-2">Protocol model</div>
          <div className="space-y-4 text-[13px] leading-relaxed text-ink2">
            <p>
              Markets are isolated by collateral mint, loan mint, oracle feed,
              IRM, and LLTV. Market risk does not cross-contaminate other pools.
            </p>
            <p>
              Effective LLTV decays as settlement approaches. Borrowing is
              blocked near resolution and unsafe positions can be force-closed.
            </p>
            <p>
              The devnet deployment uses attested price caches for prediction-market
              collateral and USDC-style loan accounting.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="eyebrow-xs mb-2">{label}</div>
      <div className="numerals text-[24px] font-bold leading-none text-ink md:text-[30px]">
        {value}
      </div>
    </div>
  );
}

function MarketRow({
  market,
}: {
  market: import("@/lib/paralend-rpc").MarketView;
}) {
  const phase = marketPhase(market.resolutionTimestamp, market.marketStatus);
  const isLastCall = phase === "last-call";

  return (
    <Link
      href={`/markets/${market.publicKey}`}
      className="block rounded-lg border border-border bg-white transition-colors hover:border-ink"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={isLastCall ? "crimson" : "outline"}>
              {market.collateralSymbol}
            </Badge>
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink3">
              {market.loanSymbol}
            </span>
          </div>
          <h3 className="line-clamp-1 text-[15px] font-bold text-ink">
            {market.name}
          </h3>
        </div>
        <ResolutionCountdown
          resolutionTimestamp={market.resolutionTimestamp}
          marketStatus={market.marketStatus}
          outcomeBit={market.outcomeBit}
          compact
        />
      </div>

      <div className="h-16 border-b border-border bg-muted/30">
        <DecayCurveChart
          baseLltvBps={Math.round(market.baseLltv * 100)}
          resolutionTimestamp={market.resolutionTimestamp}
          marketStatus={market.marketStatus}
          thumbnail
        />
      </div>

      <div className="grid grid-cols-4 gap-3 px-4 py-3 text-[12px]">
        <Mini label="Supply" value={formatAPY(market.supplyApyPct)} />
        <Mini label="Borrow" value={formatAPY(market.borrowApyPct)} />
        <Mini label="LLTV" value={`${market.lltv.toFixed(0)}%`} />
        <Mini label="Used" value={formatPct(market.utilization)} />
      </div>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow-xs mb-1">{label}</div>
      <div className="numerals font-bold text-ink">{value}</div>
    </div>
  );
}
