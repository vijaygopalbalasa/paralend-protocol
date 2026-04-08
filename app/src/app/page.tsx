import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DEMO_MARKETS, TOKEN_META } from "@/lib/constants";
import { formatUSD, formatAPY, formatPct } from "@/lib/utils";

// TODO: replace mock stats with live chain data via NucleusClient
const PROTOCOL_STATS = [
  { label: "Markets", value: "13" },
  { label: "Total Value Locked", value: "$2.4M" },
  { label: "Avg Utilization", value: "72%" },
  { label: "Avg Confirmation", value: "400ms" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-20">
      {/* ── Hero ── */}
      <section className="relative pt-12 pb-6 text-center">
        {/* Background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 h-[500px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(124,58,237,0.25),transparent)]"
        />

        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Eyebrow */}
          <span className="inline-flex items-center gap-2 rounded-full border border-nucleus-border bg-nucleus-card px-4 py-1.5 text-xs font-semibold text-nucleus-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-nucleus-green animate-pulse-slow" />
            Live on Solana Devnet
          </span>

          {/* Headline */}
          <h1 className="max-w-3xl text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-nucleus-text-primary leading-tight">
            Permissionless{" "}
            <span className="text-nucleus-primary">Lending</span>{" "}
            on Solana
          </h1>

          {/* Subheadline */}
          <p className="max-w-xl text-base sm:text-lg text-nucleus-text-secondary leading-relaxed">
            Create any lending market in 30 seconds. No admin. No whitelist.
            Just math. The Morpho Blue of Solana.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Link href="/markets">
              <Button size="lg" variant="primary">
                Launch App
              </Button>
            </Link>
            <Link href="/create">
              <Button size="lg" variant="secondary">
                Create Market
              </Button>
            </Link>
          </div>

          {/* Trust signals */}
          <p className="text-xs text-nucleus-text-secondary mt-2">
            Inspired by{" "}
            <span className="text-nucleus-text-primary font-semibold">Morpho Blue</span>
            {" "}— $132M ARR on Ethereum. Zero equivalent on Solana. Until now.
          </p>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {PROTOCOL_STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-1 rounded-xl border border-nucleus-border bg-nucleus-card p-4"
          >
            <span className="text-xs font-medium text-nucleus-text-secondary uppercase tracking-wide">
              {stat.label}
            </span>
            <span className="text-2xl font-bold text-nucleus-text-primary tabular-nums">
              {stat.value}
            </span>
          </div>
        ))}
      </section>

      {/* ── Value prop: comparison table ── */}
      <section className="flex flex-col gap-8">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-nucleus-text-primary">
            While Kamino curates.{" "}
            <span className="text-nucleus-primary">Nucleus creates.</span>
          </h2>
          <p className="mt-2 text-nucleus-text-secondary text-sm">
            The same difference as Compound vs Morpho.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nucleus-border">
                <th className="text-left py-3 px-4 text-nucleus-text-secondary font-medium w-1/3" />
                <th className="text-center py-3 px-4 text-nucleus-text-secondary font-medium">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-nucleus-card border border-nucleus-border">
                    <span className="h-2 w-2 rounded-full bg-nucleus-yellow" />
                    Kamino V2
                  </div>
                </th>
                <th className="text-center py-3 px-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-nucleus-primary/10 border border-nucleus-primary/30">
                    <span className="h-2 w-2 rounded-full bg-nucleus-primary" />
                    <span className="text-violet-400 font-semibold">Nucleus</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: "Who creates markets",
                  kamino: "Team only",
                  nucleus: "Anyone",
                },
                {
                  label: "Admin key required",
                  kamino: "Yes",
                  nucleus: "No",
                },
                {
                  label: "Time to list new token",
                  kamino: "Weeks",
                  nucleus: "30 seconds",
                },
                {
                  label: "Market address",
                  kamino: "Assigned by team",
                  nucleus: "keccak256 of params",
                },
                {
                  label: "Pause/upgrade risk",
                  kamino: "Yes — admin controlled",
                  nucleus: "None — immutable",
                },
                {
                  label: "Governance",
                  kamino: "Multisig",
                  nucleus: "None needed",
                },
              ].map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-nucleus-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-3 px-4 text-nucleus-text-secondary font-medium">
                    {row.label}
                  </td>
                  <td className="py-3 px-4 text-center text-nucleus-text-secondary">
                    {row.kamino}
                  </td>
                  <td className="py-3 px-4 text-center text-violet-400 font-semibold">
                    {row.nucleus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="flex flex-col gap-8">
        <h2 className="text-2xl font-bold text-nucleus-text-primary text-center">
          Three actions. One protocol.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              className="flex flex-col gap-4 rounded-xl border border-nucleus-border bg-nucleus-card p-6"
            >
              <span className="text-4xl font-extrabold text-nucleus-primary/30 tabular-nums leading-none">
                {card.step}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold text-nucleus-text-primary">
                  {card.title}
                </h3>
                <p className="text-sm text-nucleus-text-secondary leading-relaxed">
                  {card.body}
                </p>
              </div>
              <Link href={card.cta.href} className="mt-auto">
                <Button variant="ghost" size="sm" className="px-0 text-violet-400 hover:text-violet-300">
                  {card.cta.label} →
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live markets preview ── */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-nucleus-text-primary">
            Live Markets
          </h2>
          <Link href="/markets">
            <Button variant="ghost" size="sm" className="text-violet-400 hover:text-violet-300">
              View all →
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {DEMO_MARKETS.map((market) => {
            const colMeta = TOKEN_META[market.collateral];
            const loanMeta = TOKEN_META[market.loan];
            return (
              <Link
                key={market.id}
                href={`/markets/${market.id}`}
                className="block rounded-xl border border-nucleus-border bg-nucleus-card p-5 hover:border-nucleus-primary/40 hover:bg-nucleus-card/80 transition-all duration-150 group"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{colMeta?.icon ?? "?"}</span>
                    <div>
                      <div className="text-sm font-semibold text-nucleus-text-primary">
                        {market.collateral} / {market.loan}
                      </div>
                      <div className="text-xs text-nucleus-text-secondary">
                        LLTV {market.lltv}%
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-nucleus-text-secondary group-hover:text-violet-400 transition-colors">
                    →
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-nucleus-text-secondary mb-0.5">
                      Supply APY
                    </div>
                    <div className="text-sm font-bold text-nucleus-green">
                      {formatAPY(market.supplyApy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-nucleus-text-secondary mb-0.5">
                      Borrow APY
                    </div>
                    <div className="text-sm font-bold text-nucleus-orange">
                      {formatAPY(market.borrowApy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-nucleus-text-secondary mb-0.5">
                      TVL
                    </div>
                    <div className="text-sm font-semibold text-nucleus-text-primary">
                      {formatUSD(market.tvl)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-nucleus-text-secondary mb-0.5">
                      Utilization
                    </div>
                    <div className="text-sm font-semibold text-nucleus-text-primary">
                      {formatPct(market.utilization)}
                    </div>
                  </div>
                </div>

                {/* Utilization bar */}
                <div className="mt-4">
                  <div className="h-1 w-full rounded-full bg-nucleus-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-nucleus-primary/60"
                      style={{ width: `${market.utilization}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
