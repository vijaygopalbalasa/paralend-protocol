"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { DEMO_MARKETS, TOKEN_META } from "@/lib/constants";
import {
  cn,
  formatUSD,
  formatAPY,
  formatPct,
  formatHealthFactor,
  healthFactorBg,
  utilizationColor,
} from "@/lib/utils";
import Link from "next/link";

type Tab = "supply" | "borrow" | "collateral";

// Mock position state — TODO: replace with live chain data via NucleusClient
const MOCK_POSITION = {
  suppliedAssets: 0,
  suppliedShares: 0,
  borrowedAssets: 0,
  collateralAmount: 0,
  healthFactor: Infinity,
};

function MarketDetailPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();

  const marketId = params.id as string;
  const market = DEMO_MARKETS.find((m) => m.id === marketId);

  const initialTab = (searchParams.get("tab") as Tab) || "supply";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Form state
  const [supplyAmount, setSupplyAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [collateralDeposit, setCollateralDeposit] = useState("");
  const [collateralWithdraw, setCollateralWithdraw] = useState("");

  // Loading states for tx simulation
  const [loadingSupply, setLoadingSupply] = useState(false);
  const [loadingWithdraw, setLoadingWithdraw] = useState(false);
  const [loadingBorrow, setLoadingBorrow] = useState(false);
  const [loadingRepay, setLoadingRepay] = useState(false);
  const [loadingDepositCol, setLoadingDepositCol] = useState(false);
  const [loadingWithdrawCol, setLoadingWithdrawCol] = useState(false);

  if (!market) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-nucleus-text-secondary">Market not found.</p>
        <Link href="/markets">
          <Button variant="secondary">Back to Markets</Button>
        </Link>
      </div>
    );
  }

  const colMeta = TOKEN_META[market.collateral];
  const loanMeta = TOKEN_META[market.loan];

  // Simulate tx (mock) — TODO: replace with NucleusClient transaction calls
  const simulateTx = async (
    setter: (v: boolean) => void,
    action: string
  ) => {
    setter(true);
    await new Promise((r) => setTimeout(r, 1200));
    setter(false);
    alert(`[MOCK] ${action} transaction submitted. Connect wallet and deploy program to execute for real.`);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "supply", label: "Supply" },
    { id: "borrow", label: "Borrow" },
    { id: "collateral", label: "Collateral" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-nucleus-text-secondary">
        <Link href="/markets" className="hover:text-nucleus-text-primary transition-colors">
          Markets
        </Link>
        <span className="mx-2">/</span>
        <span className="text-nucleus-text-primary font-medium">
          {market.collateral} / {market.loan}
        </span>
      </nav>

      {/* Market header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-nucleus-card border-2 border-nucleus-bg text-2xl z-10">
              {colMeta?.icon ?? "?"}
            </span>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-nucleus-card border-2 border-nucleus-bg text-2xl">
              {loanMeta?.icon ?? "?"}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-nucleus-text-primary">
              {market.collateral} / {market.loan}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="gray">LLTV {market.lltv}%</Badge>
              <span className="text-xs text-nucleus-text-secondary">{market.oracle}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Market stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card noPadding innerClassName="p-4">
          <Stat
            label="Supply APY"
            value={formatAPY(market.supplyApy)}
            valueClassName="text-nucleus-green"
          />
        </Card>
        <Card noPadding innerClassName="p-4">
          <Stat
            label="Borrow APY"
            value={formatAPY(market.borrowApy)}
            valueClassName="text-nucleus-orange"
          />
        </Card>
        <Card noPadding innerClassName="p-4">
          <Stat
            label="TVL"
            value={formatUSD(market.tvl)}
          />
        </Card>
        <Card noPadding innerClassName="p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-nucleus-text-secondary uppercase tracking-wide">
              Utilization
            </span>
            <span className="text-xl font-bold text-nucleus-text-primary tabular-nums">
              {formatPct(market.utilization)}
            </span>
            <div className="h-1.5 w-full rounded-full bg-nucleus-border overflow-hidden mt-1">
              <div
                className={`h-full rounded-full ${utilizationColor(market.utilization)}`}
                style={{ width: `${market.utilization}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Main content: tabs + info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interaction panel (2/3 width) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Tab selector */}
          <div className="flex rounded-lg border border-nucleus-border bg-nucleus-card p-1 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 py-2 rounded-md text-sm font-medium transition-all duration-150",
                  activeTab === tab.id
                    ? "bg-nucleus-primary text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                    : "text-nucleus-text-secondary hover:text-nucleus-text-primary"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Supply tab */}
          {activeTab === "supply" && (
            <div className="flex flex-col gap-4">
              {/* Supply form */}
              <Card header={<span className="font-semibold text-nucleus-text-primary">Supply {market.loan}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loan})`}
                    type="number"
                    placeholder="0.00"
                    value={supplyAmount}
                    onChange={(e) => setSupplyAmount(e.target.value)}
                    suffix={market.loan}
                    onMax={() => setSupplyAmount("5000")} // TODO: use wallet balance
                    hint={`Wallet balance: — ${market.loan}`}
                  />

                  {/* Position preview */}
                  <div className="rounded-lg border border-nucleus-border bg-nucleus-bg p-4 flex flex-col gap-2 text-sm">
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Your supplied</span>
                      {/* TODO: fetch from Position PDA */}
                      <span className="text-nucleus-text-primary font-medium">
                        {MOCK_POSITION.suppliedAssets > 0
                          ? formatUSD(MOCK_POSITION.suppliedAssets)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Share tokens received</span>
                      {/* TODO: compute from to_shares_down */}
                      <span className="text-nucleus-text-primary font-medium">—</span>
                    </div>
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Supply APY</span>
                      <span className="text-nucleus-green font-semibold">
                        {formatAPY(market.supplyApy)}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={loadingSupply}
                    disabled={!supplyAmount || Number(supplyAmount) <= 0}
                    onClick={() => simulateTx(setLoadingSupply, `Supply ${supplyAmount} ${market.loan}`)}
                  >
                    Supply {market.loan}
                  </Button>
                </div>
              </Card>

              {/* Withdraw form */}
              <Card header={<span className="font-semibold text-nucleus-text-primary">Withdraw {market.loan}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loan})`}
                    type="number"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    suffix={market.loan}
                    onMax={() => setWithdrawAmount(String(MOCK_POSITION.suppliedAssets))}
                    hint={`Currently supplied: ${MOCK_POSITION.suppliedAssets > 0 ? formatUSD(MOCK_POSITION.suppliedAssets) : "—"}`}
                  />
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    loading={loadingWithdraw}
                    disabled={!withdrawAmount || Number(withdrawAmount) <= 0}
                    onClick={() => simulateTx(setLoadingWithdraw, `Withdraw ${withdrawAmount} ${market.loan}`)}
                  >
                    Withdraw {market.loan}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Borrow tab */}
          {activeTab === "borrow" && (
            <div className="flex flex-col gap-4">
              {/* Borrow form */}
              <Card header={<span className="font-semibold text-nucleus-text-primary">Borrow {market.loan}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loan})`}
                    type="number"
                    placeholder="0.00"
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    suffix={market.loan}
                    hint={`Max borrow: depends on collateral posted`}
                  />

                  {/* Health factor preview */}
                  <div className="rounded-lg border border-nucleus-border bg-nucleus-bg p-4 flex flex-col gap-2 text-sm">
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Collateral posted</span>
                      {/* TODO: fetch from Position PDA */}
                      <span className="text-nucleus-text-primary font-medium">
                        {MOCK_POSITION.collateralAmount > 0
                          ? `${MOCK_POSITION.collateralAmount} ${market.collateral}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Current debt</span>
                      <span className="text-nucleus-text-primary font-medium">—</span>
                    </div>
                    <div className="flex justify-between items-center text-nucleus-text-secondary">
                      <span>Health Factor</span>
                      {/* TODO: compute health_factor = (collateral_value * lltv) / (debt_value * BPS) */}
                      <span
                        className={cn(
                          "font-bold text-base px-2 py-0.5 rounded border",
                          healthFactorBg(MOCK_POSITION.healthFactor)
                        )}
                      >
                        {formatHealthFactor(MOCK_POSITION.healthFactor)}
                      </span>
                    </div>
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Borrow APY</span>
                      <span className="text-nucleus-orange font-semibold">
                        {formatAPY(market.borrowApy)}
                      </span>
                    </div>
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>LLTV</span>
                      <span className="text-nucleus-text-primary font-medium">
                        {market.lltv}%
                      </span>
                    </div>
                  </div>

                  {MOCK_POSITION.collateralAmount === 0 && (
                    <div className="rounded-lg border border-nucleus-yellow/30 bg-nucleus-yellow/5 p-3 text-xs text-nucleus-yellow">
                      You need to deposit {market.collateral} collateral before borrowing. Use the Collateral tab.
                    </div>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={loadingBorrow}
                    disabled={!borrowAmount || Number(borrowAmount) <= 0}
                    onClick={() => simulateTx(setLoadingBorrow, `Borrow ${borrowAmount} ${market.loan}`)}
                  >
                    Borrow {market.loan}
                  </Button>
                </div>
              </Card>

              {/* Repay form */}
              <Card header={<span className="font-semibold text-nucleus-text-primary">Repay {market.loan}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loan})`}
                    type="number"
                    placeholder="0.00"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    suffix={market.loan}
                    onMax={() => setRepayAmount(String(MOCK_POSITION.borrowedAssets))}
                    hint={`Outstanding debt: ${MOCK_POSITION.borrowedAssets > 0 ? formatUSD(MOCK_POSITION.borrowedAssets) : "—"}`}
                  />
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    loading={loadingRepay}
                    disabled={!repayAmount || Number(repayAmount) <= 0}
                    onClick={() => simulateTx(setLoadingRepay, `Repay ${repayAmount} ${market.loan}`)}
                  >
                    Repay {market.loan}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Collateral tab */}
          {activeTab === "collateral" && (
            <div className="flex flex-col gap-4">
              {/* Deposit collateral */}
              <Card header={<span className="font-semibold text-nucleus-text-primary">Deposit {market.collateral} Collateral</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.collateral})`}
                    type="number"
                    placeholder="0.00"
                    value={collateralDeposit}
                    onChange={(e) => setCollateralDeposit(e.target.value)}
                    suffix={market.collateral}
                    onMax={() => setCollateralDeposit("50")} // TODO: use wallet balance
                    hint={`Wallet balance: — ${market.collateral}`}
                  />

                  <div className="rounded-lg border border-nucleus-border bg-nucleus-bg p-4 flex flex-col gap-2 text-sm">
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Current collateral</span>
                      {/* TODO: fetch from Position PDA */}
                      <span className="text-nucleus-text-primary font-medium">
                        {MOCK_POSITION.collateralAmount > 0
                          ? `${MOCK_POSITION.collateralAmount} ${market.collateral}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Collateral earns yield?</span>
                      <span className="text-nucleus-text-secondary">No (isolated lending)</span>
                    </div>
                    <div className="flex justify-between text-nucleus-text-secondary">
                      <span>Max LTV (LLTV)</span>
                      <span className="text-nucleus-text-primary font-medium">{market.lltv}%</span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={loadingDepositCol}
                    disabled={!collateralDeposit || Number(collateralDeposit) <= 0}
                    onClick={() => simulateTx(setLoadingDepositCol, `Deposit ${collateralDeposit} ${market.collateral} collateral`)}
                  >
                    Deposit {market.collateral}
                  </Button>
                </div>
              </Card>

              {/* Withdraw collateral */}
              <Card header={<span className="font-semibold text-nucleus-text-primary">Withdraw {market.collateral} Collateral</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.collateral})`}
                    type="number"
                    placeholder="0.00"
                    value={collateralWithdraw}
                    onChange={(e) => setCollateralWithdraw(e.target.value)}
                    suffix={market.collateral}
                    onMax={() => setCollateralWithdraw(String(MOCK_POSITION.collateralAmount))}
                    hint={`Posted: ${MOCK_POSITION.collateralAmount > 0 ? `${MOCK_POSITION.collateralAmount} ${market.collateral}` : "—"}`}
                  />
                  <div className="rounded-lg border border-nucleus-red/20 bg-nucleus-red/5 p-3 text-xs text-nucleus-red/80">
                    Withdrawing collateral reduces your health factor. Ensure health factor stays above 1.0 or your position may be liquidated.
                  </div>
                  <Button
                    variant="danger"
                    size="lg"
                    fullWidth
                    loading={loadingWithdrawCol}
                    disabled={!collateralWithdraw || Number(collateralWithdraw) <= 0}
                    onClick={() => simulateTx(setLoadingWithdrawCol, `Withdraw ${collateralWithdraw} ${market.collateral} collateral`)}
                  >
                    Withdraw {market.collateral}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Market info panel (1/3 width) */}
        <div className="flex flex-col gap-4">
          {/* Market parameters */}
          <Card header={<span className="font-semibold text-nucleus-text-primary">Market Parameters</span>}>
            <div className="flex flex-col gap-3 text-sm">
              {[
                { label: "Collateral Token", value: `${colMeta?.icon ?? ""} ${market.collateral}` },
                { label: "Loan Token", value: `${loanMeta?.icon ?? ""} ${market.loan}` },
                { label: "Max LTV (LLTV)", value: `${market.lltv}%` },
                { label: "Oracle", value: market.oracle },
                { label: "Interest Rate Model", value: "Linear IRM (kinked)" },
                { label: "Protocol Fee", value: "10%" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-nucleus-border/50 last:border-0">
                  <span className="text-nucleus-text-secondary">{row.label}</span>
                  <span className="text-nucleus-text-primary font-medium text-right">{row.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* IRM info */}
          <Card header={<span className="font-semibold text-nucleus-text-primary">Rate Model</span>}>
            <div className="flex flex-col gap-2 text-sm text-nucleus-text-secondary">
              <p>Linear kinked IRM. Rates are WAD-scaled per-second, accrued lazily on every interaction.</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {[
                  { label: "0% utilization", rate: "0% APY" },
                  { label: "80% (kink)", rate: "~4% APY" },
                  { label: "100% utilization", rate: "~50% APY" },
                ].map((point) => (
                  <div key={point.label} className="flex justify-between">
                    <span>{point.label}</span>
                    <span className="text-nucleus-text-primary font-medium">{point.rate}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Liquidation info */}
          <Card header={<span className="font-semibold text-nucleus-text-primary">Liquidation</span>}>
            <div className="flex flex-col gap-2 text-sm text-nucleus-text-secondary">
              <p>Positions are liquidatable when Health Factor drops below 1.0.</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <span>Liquidation bonus</span>
                  <span className="text-nucleus-text-primary font-medium">Up to 15%</span>
                </div>
                <div className="flex justify-between">
                  <span>Bad debt handling</span>
                  <span className="text-nucleus-text-primary font-medium">Socialized</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function MarketDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-nucleus-primary border-t-transparent" />
      </div>
    }>
      <MarketDetailPageInner />
    </Suspense>
  );
}
