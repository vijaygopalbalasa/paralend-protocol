"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEMO_MARKETS, TOKEN_META, LLTV_PRESETS, MAX_FEE_BPS } from "@/lib/constants";
import { cn, formatUSD, formatAPY } from "@/lib/utils";

// Well-known devnet addresses for convenience
const KNOWN_MINTS: Record<string, { label: string; icon: string; address: string }> = {
  USDC: {
    label: "USDC",
    icon: "$",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  SOL: {
    label: "Wrapped SOL",
    icon: "◎",
    address: "So11111111111111111111111111111111111111112",
  },
  JUP: {
    label: "Jupiter",
    icon: "♃",
    address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  },
};

export default function CreateMarketPage() {
  // Form state
  const [collateralMint, setCollateralMint] = useState("");
  const [loanMint, setLoanMint] = useState("");
  const [collateralOracleFeedId, setCollateralOracleFeedId] = useState("");
  const [irmAddress, setIrmAddress] = useState("");
  const [lltv, setLltv] = useState(80);
  const [feeBps, setFeeBps] = useState(1000);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Basic validation
  function validate() {
    const errs: Record<string, string> = {};
    if (!collateralMint.trim()) errs.collateralMint = "Collateral mint is required";
    else if (collateralMint.length < 32) errs.collateralMint = "Enter a valid Solana address (32-44 chars)";
    if (!loanMint.trim()) errs.loanMint = "Loan mint is required";
    else if (loanMint.length < 32) errs.loanMint = "Enter a valid Solana address";
    if (!irmAddress.trim()) errs.irmAddress = "LinearIRM address is required";
    if (feeBps > MAX_FEE_BPS) errs.feeBps = `Max fee is ${MAX_FEE_BPS} BPS (25%)`;
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);

    // TODO: build and send create_market transaction via NucleusClient
    // const client = new NucleusClient(connection, wallet);
    // const tx = await client.createMarket({
    //   collateralMint: new PublicKey(collateralMint),
    //   loanMint: new PublicKey(loanMint),
    //   collateralOracleFeedId: hexToBytes32(collateralOracleFeedId),
    //   loanOracleFeedId: new Uint8Array(32), // zeros = assume $1 stablecoin
    //   irm: new PublicKey(irmAddress),
    //   lltv: BigInt(lltv) * 100n, // convert % to BPS
    // });
    // const sig = await client.sendAndConfirm(tx);

    await new Promise((r) => setTimeout(r, 1400));
    setLoading(false);
    alert("[MOCK] Market creation transaction submitted. Connect wallet and deploy program to create markets on-chain.");
  }

  const feePct = (feeBps / 100).toFixed(2);

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-nucleus-text-primary">Create a Market</h1>
        <p className="text-sm text-nucleus-text-secondary mt-1">
          Deploy a permissionless isolated lending market in one transaction.
          The market address is deterministically derived from your 5 parameters — no admin required.
        </p>
      </div>

      {/* Cost + time callout */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-3 rounded-lg border border-nucleus-border bg-nucleus-card px-4 py-3">
          <span className="text-xl">◎</span>
          <div>
            <div className="text-xs text-nucleus-text-secondary uppercase tracking-wide">Estimated Cost</div>
            <div className="text-sm font-semibold text-nucleus-text-primary">~0.01 SOL</div>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-3 rounded-lg border border-nucleus-border bg-nucleus-card px-4 py-3">
          <span className="text-xl">⚡</span>
          <div>
            <div className="text-xs text-nucleus-text-secondary uppercase tracking-wide">Confirmation Time</div>
            <div className="text-sm font-semibold text-nucleus-text-primary">~400ms</div>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-3 rounded-lg border border-nucleus-border bg-nucleus-card px-4 py-3">
          <span className="text-xl">🔒</span>
          <div>
            <div className="text-xs text-nucleus-text-secondary uppercase tracking-wide">Admin Required</div>
            <div className="text-sm font-semibold text-nucleus-green">None</div>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card
          header={
            <CardHeader
              title="Token Pair"
              description="Choose which token is collateral and which is borrowed"
            />
          }
        >
          <div className="flex flex-col gap-5">
            {/* Quick-fill shortcuts */}
            <div>
              <div className="text-xs text-nucleus-text-secondary uppercase tracking-wide mb-2">
                Quick fill — common tokens
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(KNOWN_MINTS).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (!collateralMint) setCollateralMint(meta.address);
                      else setLoanMint(meta.address);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-nucleus-border bg-nucleus-bg hover:border-nucleus-primary/40 hover:bg-nucleus-primary/5 text-xs font-medium text-nucleus-text-secondary hover:text-nucleus-text-primary transition-all"
                  >
                    <span>{meta.icon}</span>
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Collateral Token Mint"
              placeholder="So11111111111111111111111111111111111111112"
              value={collateralMint}
              onChange={(e) => setCollateralMint(e.target.value)}
              error={errors.collateralMint}
              hint="The token users will post as collateral (e.g. SOL, jitoSOL, JUP)"
            />

            <Input
              label="Loan Token Mint"
              placeholder="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
              value={loanMint}
              onChange={(e) => setLoanMint(e.target.value)}
              error={errors.loanMint}
              hint="The token users will borrow (e.g. USDC). Set loan oracle to all-zeros for $1 stablecoins."
            />
          </div>
        </Card>

        <Card
          header={
            <CardHeader
              title="Oracle"
              description="Pyth price feed ID for the collateral. Loan oracle defaults to $1 (all-zeros = stablecoin shortcut)."
            />
          }
        >
          <div className="flex flex-col gap-5">
            <Input
              label="Collateral Oracle Feed ID (hex)"
              placeholder="0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
              value={collateralOracleFeedId}
              onChange={(e) => setCollateralOracleFeedId(e.target.value)}
              hint="32-byte Pyth price feed ID. Leave blank to use StaticOracle (localnet testing only)."
            />

            <div className="rounded-lg border border-nucleus-border bg-nucleus-bg p-3 text-xs text-nucleus-text-secondary">
              <span className="font-semibold text-nucleus-text-primary">Tip:</span> All-zeros loan feed ID = protocol assumes loan token is exactly $1.
              Use this for USDC, USDT, and other USD stablecoins — avoids oracle dependency for the loan side.
            </div>
          </div>
        </Card>

        <Card
          header={
            <CardHeader
              title="Interest Rate Model"
              description="Address of a LinearIrm PDA created via create_irm instruction"
            />
          }
        >
          <div className="flex flex-col gap-5">
            <Input
              label="LinearIRM Account Address"
              placeholder="LinearIrm PDA address..."
              value={irmAddress}
              onChange={(e) => setIrmAddress(e.target.value)}
              error={errors.irmAddress}
              hint="Create an IRM first via the protocol admin. The default kinked IRM: 0% at 0% util, ~4% at 80%, ~50% at 100%."
            />

            {/* IRM params preview */}
            <div className="rounded-lg border border-nucleus-border bg-nucleus-bg p-4">
              <div className="text-xs text-nucleus-text-secondary uppercase tracking-wide mb-3">
                Default IRM curve
              </div>
              <div className="flex items-end gap-1 h-12">
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((util) => {
                  // Approximate kinked IRM visualization
                  const rate = util <= 80
                    ? (util / 80) * 4
                    : 4 + ((util - 80) / 20) * 46;
                  const height = Math.min(100, (rate / 50) * 100);
                  return (
                    <div
                      key={util}
                      className="flex-1 rounded-sm bg-nucleus-primary/40"
                      style={{ height: `${Math.max(4, height)}%` }}
                      title={`${util}% util → ~${rate.toFixed(1)}% APY`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-nucleus-text-secondary">
                <span>0%</span>
                <span>Utilization</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </Card>

        <Card
          header={
            <CardHeader
              title="Risk Parameters"
              description="LLTV sets the max loan-to-value ratio. Lower = safer for lenders."
            />
          }
        >
          <div className="flex flex-col gap-6">
            {/* LLTV slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-medium text-nucleus-text-secondary uppercase tracking-wide">
                  Max LTV (LLTV)
                </label>
                <span className="text-xl font-bold text-nucleus-text-primary tabular-nums">
                  {lltv}%
                </span>
              </div>

              <input
                type="range"
                min={50}
                max={95}
                step={1}
                value={lltv}
                onChange={(e) => setLltv(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none bg-nucleus-border cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #7C3AED ${((lltv - 50) / 45) * 100}%, #2D2D4E ${((lltv - 50) / 45) * 100}%)`,
                }}
              />

              <div className="flex justify-between mt-1 text-[10px] text-nucleus-text-secondary">
                <span>50%</span>
                <span>95%</span>
              </div>

              {/* LLTV presets */}
              <div className="flex flex-wrap gap-2 mt-3">
                {LLTV_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setLltv(preset.lltv)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                      lltv === preset.lltv
                        ? "bg-nucleus-primary/10 border-nucleus-primary/40 text-violet-400"
                        : "border-nucleus-border bg-nucleus-bg text-nucleus-text-secondary hover:border-nucleus-primary/30 hover:text-nucleus-text-primary"
                    )}
                    title={preset.description}
                  >
                    {preset.label} — {preset.lltv}%
                  </button>
                ))}
              </div>
            </div>

            {/* Fee BPS */}
            <div>
              <Input
                label="Protocol Fee (BPS)"
                type="number"
                min={0}
                max={MAX_FEE_BPS}
                value={feeBps}
                onChange={(e) => setFeeBps(Number(e.target.value))}
                error={errors.feeBps}
                hint={`${feePct}% of interest goes to the protocol treasury. Max is 2500 BPS (25%).`}
                suffix="BPS"
              />
            </div>
          </div>
        </Card>

        {/* Summary + submit */}
        <div className="rounded-xl border border-nucleus-border bg-nucleus-card p-5 flex flex-col gap-4">
          <div className="text-sm font-semibold text-nucleus-text-primary">Market Summary</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {[
              { label: "Collateral", value: collateralMint ? collateralMint.slice(0, 8) + "..." : "—" },
              { label: "Loan Token", value: loanMint ? loanMint.slice(0, 8) + "..." : "—" },
              { label: "LLTV", value: `${lltv}%` },
              { label: "Protocol Fee", value: `${feePct}%` },
              { label: "Oracle", value: collateralOracleFeedId ? "Pyth" : "Static (testnet)" },
              { label: "IRM", value: irmAddress ? irmAddress.slice(0, 8) + "..." : "—" },
            ].map((row) => (
              <div key={row.label} className="flex flex-col gap-0.5">
                <span className="text-xs text-nucleus-text-secondary">{row.label}</span>
                <span className="font-medium text-nucleus-text-primary font-mono text-xs">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="text-xs text-nucleus-text-secondary border-t border-nucleus-border pt-3">
            Market ID is computed as{" "}
            <code className="text-violet-400 font-mono">
              keccak256(collateral_mint, loan_mint, col_oracle, loan_oracle, irm, lltv)
            </code>
            . It is immutable and deterministic — anyone can verify it.
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
          >
            Create Market →
          </Button>
        </div>
      </form>

      {/* Existing markets for inspiration */}
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-nucleus-text-primary">
          Existing Markets — for reference
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DEMO_MARKETS.map((market) => {
            const colMeta = TOKEN_META[market.collateral];
            return (
              <Link
                key={market.id}
                href={`/markets/${market.id}`}
                className="flex items-center gap-3 rounded-xl border border-nucleus-border bg-nucleus-card p-4 hover:border-nucleus-primary/40 transition-colors"
              >
                <span className="text-2xl">{colMeta?.icon ?? "?"}</span>
                <div>
                  <div className="text-sm font-semibold text-nucleus-text-primary">
                    {market.collateral} / {market.loan}
                  </div>
                  <div className="text-xs text-nucleus-text-secondary">
                    LLTV {market.lltv}% · TVL {formatUSD(market.tvl)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
