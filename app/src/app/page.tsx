import Link from "next/link";

import { Button } from "@/components/ui/button";
import { resolveTokenIcon } from "@/lib/demo-config";
import { getAllMarkets, getProtocolStats } from "@/lib/paralend-rpc";
import { formatAPY, formatPct, formatUSD } from "@/lib/utils";

export const revalidate = 30;

export default async function HomePage() {
  const [stats, markets] = await Promise.all([getProtocolStats(), getAllMarkets()]);
  const featuredMarkets = markets.slice(0, 3);
  const statsCards = [
    { label: "Markets", value: String(stats.marketCount) },
    { label: "Total Value Locked", value: formatUSD(stats.totalTvlUsd) },
    { label: "Total Borrowed", value: formatUSD(stats.totalBorrowedUsd) },
    { label: "Avg Utilization", value: formatPct(stats.avgUtilization) },
  ];

  return (
    <div className="flex flex-col gap-20">
      <section className="relative pt-12 pb-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 h-[500px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,0,0,0.05),transparent)]"
        />

        <div className="relative z-10 flex flex-col items-center gap-6 animate-float">
          <span className="inline-flex items-center gap-2 rounded-full border border-paralend-border bg-paralend-card px-4 py-1.5 text-xs font-bold text-paralend-text-primary shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-paralend-green animate-pulse-slow" />
            Live on Solana Devnet
          </span>

          <h1 className="max-w-3xl text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-paralend-text-primary leading-tight">
            Borrow USDC against your{" "}
            <span className="text-paralend-primary underline decoration-4 underline-offset-4 decoration-paralend-border">
              Kalshi
            </span>{" "}
            positions
          </h1>

          <p className="max-w-xl text-lg sm:text-xl text-paralend-text-secondary leading-relaxed font-medium">
            The first credit layer for tokenized prediction markets on
            Solana. Deposit YES/NO shares as collateral, borrow against
            them, keep the upside of the event while your capital works
            elsewhere.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Link href="/markets">
              <Button size="lg" variant="primary" className="px-8 text-lg hover:-translate-y-0.5">
                Explore Markets
              </Button>
            </Link>
            <Link href="/positions">
              <Button size="lg" variant="secondary" className="px-8 text-lg hover:-translate-y-0.5">
                My Positions
              </Button>
            </Link>
          </div>

          <p className="text-sm text-paralend-text-secondary mt-4 font-medium">
            Powered by{" "}
            <span className="text-paralend-text-primary font-bold">Kalshi</span>
            {" "}tokenized contracts via{" "}
            <span className="text-paralend-text-primary font-bold">DFlow</span>
            {" "}— $20B prediction-market collateral, 0% borrowable. Until now.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
        {statsCards.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-1 rounded-xl border border-paralend-border bg-paralend-card p-5 shadow-sm transform transition hover:-translate-y-1 hover:shadow-md"
          >
            <span className="text-xs font-bold text-paralend-text-secondary uppercase tracking-wider">
              {stat.label}
            </span>
            <span className="text-3xl font-black text-paralend-text-primary tabular-nums tracking-tight">
              {stat.value}
            </span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-10 mt-12 bg-white rounded-2xl border border-paralend-border p-8 sm:p-12 shadow-sm">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-paralend-text-primary tracking-tight">
            Kamino lends against liquid staking.{" "}
            <span className="text-paralend-primary">
              Paralend lends against events.
            </span>
          </h2>
          <p className="mt-3 text-paralend-text-secondary text-lg font-medium">
            Kalshi's $11B/mo of tokenized positions, finally productive capital.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-paralend-border">
          <table className="w-full text-base">
            <thead className="bg-[#FAFAFA]">
              <tr className="border-b border-paralend-border">
                <th className="text-left py-4 px-6 text-paralend-text-secondary font-bold w-1/3" />
                <th className="text-center py-4 px-6 text-paralend-text-secondary font-bold">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-paralend-border shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-paralend-yellow" />
                    Kamino / Jup Lend
                  </div>
                </th>
                <th className="text-center py-4 px-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#000000] text-white shadow-md">
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                    <span className="font-bold">Paralend</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paralend-border">
              {[
                {
                  label: "Collateral type",
                  kamino: "LSTs, stables, majors",
                  paralend: "Kalshi YES / NO tokens",
                },
                {
                  label: "Valuation curve",
                  kamino: "Static LLTV",
                  paralend: "Time-decay to resolution",
                },
                {
                  label: "Handles binary outcomes",
                  kamino: "No",
                  paralend: "Force-close + auto-settle",
                },
                {
                  label: "Event-market TAM on Solana",
                  kamino: "n/a",
                  paralend: "$20B+ untapped",
                },
                {
                  label: "Oracle dependency",
                  kamino: "Pyth / Switchboard",
                  paralend: "DFlow CLP + attester EMA",
                },
                {
                  label: "What happens at resolution",
                  kamino: "n/a",
                  paralend: "Winners redeem 1:1, losers socialised",
                },
              ].map((row) => (
                <tr
                  key={row.label}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="py-4 px-6 text-paralend-text-secondary font-bold">
                    {row.label}
                  </td>
                  <td className="py-4 px-6 text-center text-paralend-text-secondary font-medium">
                    {row.kamino}
                  </td>
                  <td className="py-4 px-6 text-center text-paralend-primary font-black">
                    {row.paralend}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-10 mt-12 bg-white rounded-2xl border border-paralend-border p-8 sm:p-12 shadow-sm">
        <h2 className="text-3xl font-black text-paralend-text-primary text-center tracking-tight">
          Three steps. One capital-efficient bet.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Deposit a Kalshi position",
              body: "Bring YES or NO tokens from a Kalshi market on Solana (via DFlow). They stay as collateral on Paralend until you repay — the upside of the event is still yours.",
              cta: { label: "Explore Markets", href: "/markets" },
            },
            {
              step: "02",
              title: "Borrow USDC",
              body: "Borrow against your position at a time-aware LLTV. The safety margin tightens as resolution approaches — no silent liquidations, no surprises.",
              cta: { label: "Open a Position", href: "/markets" },
            },
            {
              step: "03",
              title: "Repay or redeem",
              body: "Repay any time before the force-close window. When the market resolves, winners redeem 1:1 for USDC through DFlow; losers' debt is socialised across lenders.",
              cta: { label: "My Positions", href: "/positions" },
            },
          ].map((card) => (
            <div
              key={card.step}
              className="flex flex-col gap-4 rounded-xl border border-paralend-border bg-[#FAFAFA] p-8 shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
            >
              <span className="text-5xl font-black text-paralend-border tabular-nums leading-none">
                {card.step}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-bold text-paralend-text-primary tracking-tight">
                  {card.title}
                </h3>
                <p className="text-sm text-paralend-text-secondary leading-relaxed font-medium">
                  {card.body}
                </p>
              </div>
              <Link href={card.cta.href} className="mt-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 text-paralend-primary hover:text-paralend-primary-hover font-bold tracking-tight"
                >
                  {card.cta.label} →
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-8 mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-paralend-text-primary tracking-tight">Live Markets</h2>
          <Link href="/markets">
            <Button
              variant="ghost"
              size="sm"
              className="text-paralend-primary hover:text-paralend-primary-hover font-bold tracking-tight"
            >
              View all →
            </Button>
          </Link>
        </div>

        {featuredMarkets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {featuredMarkets.map((market) => (
              <Link
                key={market.publicKey}
                href={`/markets/${market.publicKey}`}
                className="block rounded-xl border border-paralend-border bg-white p-6 shadow-sm hover:border-gray-300 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl shrink-0">
                      {resolveTokenIcon(market.collateralMint)}
                    </span>
                    <div>
                      <div className="text-base font-bold text-paralend-text-primary tracking-tight">
                        {market.collateralSymbol} / {market.loanSymbol}
                      </div>
                      <div className="text-xs font-medium text-paralend-text-secondary uppercase tracking-wider">
                        LLTV {market.lltv}%
                      </div>
                    </div>
                  </div>
                  <span className="text-lg text-paralend-border group-hover:text-paralend-primary transition-colors">
                    →
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-1">
                      Supply APY
                    </div>
                    <div className="text-sm font-black text-paralend-green tabular-nums">
                      {formatAPY(market.supplyApyPct)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-1">
                      Borrow APY
                    </div>
                    <div className="text-sm font-black text-paralend-orange tabular-nums">
                      {formatAPY(market.borrowApyPct)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-1">TVL</div>
                    <div className="text-sm font-bold text-paralend-text-primary tabular-nums">
                      {formatUSD(market.tvlUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-paralend-text-secondary uppercase tracking-wider mb-1">
                      Utilization
                    </div>
                    <div className="text-sm font-bold text-paralend-text-primary tabular-nums">
                      {formatPct(market.utilization)}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="h-1.5 w-full rounded-full bg-[#FAFAFA] overflow-hidden border border-paralend-border/50">
                    <div
                      className="h-full rounded-full bg-paralend-primary transition-all duration-500"
                      style={{ width: `${market.utilization}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-paralend-border border-dashed bg-white p-12 text-center shadow-sm">
            <p className="text-sm font-medium text-paralend-text-secondary">
              No live devnet markets yet. Deploy the program and run the demo setup
              scripts to populate this view.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
