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
            Permissionless <span className="text-paralend-primary underline decoration-4 underline-offset-4 decoration-paralend-border">Lending</span>{" "}
            on Solana
          </h1>

          <p className="max-w-xl text-lg sm:text-xl text-paralend-text-secondary leading-relaxed font-medium">
            Create any isolated lending market in one transaction. No token listing
            committee. No governance delay. Just deterministic market creation and
            immutable risk parameters.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Link href="/markets">
              <Button size="lg" variant="primary" className="px-8 text-lg hover:-translate-y-0.5">
                Launch App
              </Button>
            </Link>
            <Link href="/create">
              <Button size="lg" variant="secondary" className="px-8 text-lg hover:-translate-y-0.5">
                Create Market
              </Button>
            </Link>
          </div>

          <p className="text-sm text-paralend-text-secondary mt-4 font-medium">
            Inspired by{" "}
            <span className="text-paralend-text-primary font-bold">Morpho Blue</span>
            {" "}— zero equivalent on Solana. Until now.
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
            While Kamino curates.{" "}
            <span className="text-paralend-primary">Paralend creates.</span>
          </h2>
          <p className="mt-3 text-paralend-text-secondary text-lg font-medium">
            The same difference as Compound vs Morpho.
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
                    Kamino V2
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
                  label: "Who creates markets",
                  kamino: "Team only",
                  paralend: "Anyone",
                },
                {
                  label: "Admin key required",
                  kamino: "Yes",
                  paralend: "No",
                },
                {
                  label: "Time to list new token",
                  kamino: "Weeks",
                  paralend: "30 seconds",
                },
                {
                  label: "Market address",
                  kamino: "Assigned by team",
                  paralend: "keccak256 of params",
                },
                {
                  label: "Pause/upgrade risk",
                  kamino: "Yes — admin controlled",
                  paralend: "None — immutable",
                },
                {
                  label: "Governance",
                  kamino: "Multisig",
                  paralend: "None needed",
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
          Three actions. One protocol.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Create a Market",
              body: "Pick any collateral, any loan token, set an LLTV and IRM. One transaction. The market address is deterministic — derived from your 5 parameters.",
              cta: { label: "Create Market", href: "/create" },
            },
            {
              step: "02",
              title: "Supply or Borrow",
              body: "Supply loan tokens to earn yield. Post collateral and borrow against it. Interest accrues lazily on every interaction — no crank required.",
              cta: { label: "Browse Markets", href: "/markets" },
            },
            {
              step: "03",
              title: "Manage Risk",
              body: "Monitor health factors across all your positions. Liquidators earn a bonus up to 15% for keeping the protocol solvent. Bad debt is socialized.",
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
