"use client";

import Link from "next/link";
import { BN } from "@coral-xyz/anchor";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DecayCurveChart } from "@/components/DecayCurveChart";
import { Input } from "@/components/ui/input";
import { Meter } from "@/components/ui/meter";
import { ResolutionCountdown } from "@/components/ResolutionCountdown";
import { useMarketDetail } from "@/hooks/useMarketDetail";
import {
  deriveCollateralVaultPDA,
  deriveLoanVaultPDA,
  derivePositionPDA,
  derivePriceCachePDA,
  deriveProtocolStatePDA,
  ensureAtaIx,
  formatTokenAmount,
  makeAnchorProvider,
  makeProgram,
  parseTokenAmount,
  toAnchorWallet,
} from "@/lib/paralend-program";
import {
  COPY,
  marketPhase,
  safetyLabel,
  safetyScore,
  safetyTone,
  type MarketPhase,
} from "@/lib/copy";
import { cn, formatAPY, formatPct, formatUSD } from "@/lib/utils";
import { POST_BORROW_CUTOFF_SECONDS } from "@/lib/constants";

type Tab = "borrow" | "earn" | "collateral";

type Notice =
  | { type: "success"; message: string; sig?: string }
  | { type: "error"; message: string }
  | null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function MarketDetailPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const wallet = useWallet();

  const marketAddress = typeof params.id === "string" ? params.id : null;
  const requestedTab = ((searchParams.get("tab") as Tab) || "borrow") as Tab;

  const { market, loading, error, reload } = useMarketDetail(marketAddress);

  const [activeTab, setActiveTab] = useState<Tab>(requestedTab);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [earnAmount, setEarnAmount] = useState("");
  const [withdrawEarnAmount, setWithdrawEarnAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [withdrawBetAmount, setWithdrawBetAmount] = useState("");

  useEffect(() => setActiveTab(requestedTab), [requestedTab]);

  const runAction = async (label: string, buildTx: () => Promise<Transaction>) => {
    const anchorWallet = toAnchorWallet(wallet);
    if (!anchorWallet) {
      setNotice({ type: "error", message: "Connect a wallet to sign transactions." });
      return;
    }
    setPendingAction(label);
    setNotice(null);
    try {
      const provider = makeAnchorProvider(connection, anchorWallet);
      const tx = await buildTx();
      const sig = await provider.sendAndConfirm(tx, []);
      setNotice({ type: "success", message: `${label} confirmed.`, sig: sig.slice(0, 10) });
      await reload();
    } catch (txErr) {
      setNotice({ type: "error", message: errorMessage(txErr) });
    } finally {
      setPendingAction(null);
    }
  };

  const withProgram = () => {
    const anchorWallet = toAnchorWallet(wallet);
    if (!anchorWallet || !market) {
      throw new Error("Wallet and market must be ready.");
    }
    const program = makeProgram(connection, anchorWallet);
    const owner = anchorWallet.publicKey;
    const positionPda = derivePositionPDA(market.marketId, owner);
    const loanVault = deriveLoanVaultPDA(market.marketId);
    const collateralVault = deriveCollateralVaultPDA(market.marketId);
    const priceCache = derivePriceCachePDA(market.marketId);
    const protocolState = deriveProtocolStatePDA();
    return { owner, program, positionPda, loanVault, collateralVault, priceCache, protocolState };
  };

  const createPositionIx = async () => {
    if (!market || market.position.exists) return null;
    const { program, owner, positionPda } = withProgram();
    const methods = program.methods as any;
    return methods
      .createPosition(Array.from(market.marketId))
      .accountsPartial({
        payer: owner,
        owner,
        market: market.publicKey,
        position: positionPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  };

  const handleEarn = async () => {
    if (!market) return;
    const amt = parseTokenAmount(earnAmount, market.loanDecimals);
    if (!amt || amt <= 0n) return setNotice({ type: "error", message: "Enter an amount." });
    await runAction("Lend", async () => {
      const { owner, program, positionPda, loanVault, protocolState } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address, instruction } = ensureAtaIx(market.loanMint, owner, owner);
      tx.add(instruction);
      const m = await createPositionIx(); if (m) tx.add(m);
      tx.add(await methods.supply(Array.from(market.marketId), new BN(amt.toString()), new BN(0)).accountsPartial({ supplier: owner, protocolState, market: market.publicKey, irm: market.irm, position: positionPda, supplierLoanAta: address, loanVault, tokenProgram: TOKEN_PROGRAM_ID }).instruction());
      return tx;
    });
    setEarnAmount("");
  };

  const handleWithdrawEarn = async () => {
    if (!market) return;
    const amt = parseTokenAmount(withdrawEarnAmount, market.loanDecimals);
    if (!amt || amt <= 0n) return setNotice({ type: "error", message: "Enter an amount." });
    await runAction("Withdraw", async () => {
      const { owner, program, positionPda, loanVault } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address, instruction } = ensureAtaIx(market.loanMint, owner, owner);
      tx.add(instruction);
      tx.add(await methods.withdraw(Array.from(market.marketId), new BN(amt.toString()), new BN(0), new BN(0), new BN(0)).accountsPartial({ owner, market: market.publicKey, irm: market.irm, position: positionPda, loanVault, receiverLoanAta: address, tokenProgram: TOKEN_PROGRAM_ID }).instruction());
      return tx;
    });
    setWithdrawEarnAmount("");
  };

  const handleBorrow = async () => {
    if (!market) return;
    const amt = parseTokenAmount(borrowAmount, market.loanDecimals);
    if (!amt || amt <= 0n) return setNotice({ type: "error", message: "Enter an amount." });
    await runAction("Borrow", async () => {
      const { owner, program, positionPda, loanVault, priceCache, protocolState } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address, instruction } = ensureAtaIx(market.loanMint, owner, owner);
      tx.add(instruction);
      const m = await createPositionIx(); if (m) tx.add(m);
      tx.add(await methods.borrow(Array.from(market.marketId), new BN(amt.toString()), new BN(0)).accountsPartial({ borrower: owner, protocolState, market: market.publicKey, irm: market.irm, position: positionPda, loanVault, receiverLoanAta: address, priceCache, tokenProgram: TOKEN_PROGRAM_ID }).instruction());
      return tx;
    });
    setBorrowAmount("");
  };

  const handleRepay = async () => {
    if (!market) return;
    const amt = parseTokenAmount(repayAmount, market.loanDecimals);
    if (!amt || amt <= 0n) return setNotice({ type: "error", message: "Enter an amount." });
    await runAction("Repay", async () => {
      const { owner, program, positionPda, loanVault } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address, instruction } = ensureAtaIx(market.loanMint, owner, owner);
      tx.add(instruction);
      tx.add(await methods.repay(Array.from(market.marketId), new BN(amt.toString()), new BN(0)).accountsPartial({ repayer: owner, market: market.publicKey, irm: market.irm, position: positionPda, borrower: owner, repayerLoanAta: address, loanVault, tokenProgram: TOKEN_PROGRAM_ID }).instruction());
      return tx;
    });
    setRepayAmount("");
  };

  const handleAddBet = async () => {
    if (!market) return;
    const amt = parseTokenAmount(betAmount, market.collateralDecimals);
    if (!amt || amt <= 0n) return setNotice({ type: "error", message: "Enter an amount." });
    await runAction("Add collateral", async () => {
      const { owner, program, positionPda, collateralVault, protocolState } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address, instruction } = ensureAtaIx(market.collateralMint, owner, owner);
      tx.add(instruction);
      const m = await createPositionIx(); if (m) tx.add(m);
      tx.add(await methods.supplyCollateral(Array.from(market.marketId), new BN(amt.toString())).accountsPartial({ depositor: owner, protocolState, market: market.publicKey, position: positionPda, depositorCollateralAta: address, collateralVault, tokenProgram: TOKEN_PROGRAM_ID }).instruction());
      return tx;
    });
    setBetAmount("");
  };

  const handleTakeBet = async () => {
    if (!market) return;
    const amt = parseTokenAmount(withdrawBetAmount, market.collateralDecimals);
    if (!amt || amt <= 0n) return setNotice({ type: "error", message: "Enter an amount." });
    await runAction("Take back", async () => {
      const { owner, program, positionPda, collateralVault, priceCache } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address, instruction } = ensureAtaIx(market.collateralMint, owner, owner);
      tx.add(instruction);
      tx.add(await methods.withdrawCollateral(Array.from(market.marketId), new BN(amt.toString())).accountsPartial({ owner, market: market.publicKey, irm: market.irm, position: positionPda, collateralVault, receiverCollateralAta: address, priceCache, tokenProgram: TOKEN_PROGRAM_ID }).instruction());
      return tx;
    });
    setWithdrawBetAmount("");
  };

  if (loading && !market) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-24 text-center">
        <span className="text-ink3">Loading market...</span>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold text-ink mb-3">Market not found.</h1>
        <p className="text-ink3 mb-6">{error ?? "It may have been removed."}</p>
        <Link href="/markets">
          <Button variant="secondary">All markets</Button>
        </Link>
      </div>
    );
  }

  const phase = marketPhase(market.resolutionTimestamp, market.marketStatus);
  const isLastCall = phase === "last-call";
  const isSettled = phase === "settled";
  const remainingToResolution =
    market.resolutionTimestamp > 0
      ? market.resolutionTimestamp - Math.floor(Date.now() / 1000)
      : Number.POSITIVE_INFINITY;
  const isBorrowCutoff = remainingToResolution <= POST_BORROW_CUTOFF_SECONDS;
  const awaitingPrice = market.collateralPriceWad === 0n;
  const position = market.position;
  const safetyPct = safetyScore(position.healthFactor);
  const safetyToneVal = safetyTone(position.healthFactor);

  const loanBalanceLabel = `${formatTokenAmount(market.walletBalances.loan, market.loanDecimals, 4)} ${market.loanSymbol}`;
  const betBalanceLabel = `${formatTokenAmount(market.walletBalances.collateral, market.collateralDecimals, 4)} ${market.collateralSymbol}`;

  return (
    <div className="relative">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10 py-8 md:py-12">
        <Link
          href="/markets"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink3 transition-colors hover:text-ink"
        >
          All markets
        </Link>

        <div className="mb-8 grid grid-cols-1 gap-6 border-b border-border pb-8 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={isLastCall ? "crimson" : "outline"}>
                {market.collateralSymbol} collateral
              </Badge>
              <ResolutionCountdown
                resolutionTimestamp={market.resolutionTimestamp}
                marketStatus={market.marketStatus}
                outcomeBit={market.outcomeBit}
              />
              {market.paused && !isSettled && <Badge variant="ink">Paused</Badge>}
            </div>

            <h1 className="text-[30px] font-extrabold leading-tight text-ink sm:text-[36px] md:text-[44px]">
              {market.name}
            </h1>

            <p className="max-w-2xl text-[14px] leading-relaxed text-ink2 md:text-[15px]">
              {market.kalshiTicker && (
                <span className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-ink3">
                  {market.kalshiTicker}
                </span>
              )}
              Isolated market for {market.collateralSymbol} collateral and{" "}
              {market.loanSymbol} debt. Borrowing capacity follows the current
              effective LLTV and decays toward settlement.
            </p>

            <div className="rounded-lg border border-border bg-white p-5 md:p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="eyebrow-xs mb-1">Borrow power</div>
                  <div className="text-[13px] text-ink2 font-medium">
                    Current effective LLTV
                  </div>
                </div>
                <div className="text-right">
                  <div className="eyebrow-xs mb-1">Right now</div>
                  <div
                    className={`numerals text-3xl md:text-4xl font-extrabold leading-none ${
                      isLastCall ? "text-crimson" : "text-coral"
                    }`}
                  >
                    {market.lltv.toFixed(0)}%
                  </div>
                </div>
              </div>
              <DecayCurveChart
                baseLltvBps={market.baseLltvBps}
                resolutionTimestamp={market.resolutionTimestamp}
                marketStatus={market.marketStatus}
                height={260}
              />
            </div>
          </div>

          {/* Right rail */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <PhaseBanner phase={phase} outcomeBit={market.outcomeBit} />

            <div className="divide-y divide-border rounded-lg border border-border bg-white">
              <StatRow label="Earn APY" value={formatAPY(market.supplyApyPct)} accent="leaf" />
              <StatRow label="Borrow APY" value={formatAPY(market.borrowApyPct)} accent="coral" />
              <StatRow label="Base power" value={`${(market.baseLltvBps / 100).toFixed(0)}%`} />
              <StatRow label="Pool" value={formatUSD(market.tvlUsd)} />
              <StatRow label="Borrowed" value={formatUSD(market.borrowedUsd)} />
              <StatRow label="Utilization" value={formatPct(market.utilization)} />
            </div>
          </div>
        </div>

        {/* Notice */}
        {notice && (
          <div
            className={cn(
              "mb-6 flex items-center justify-between gap-3 rounded-lg px-5 py-4 text-[14px]",
              notice.type === "success"
                ? "bg-leaf-soft text-leaf-deep"
                : "bg-crimson-soft text-crimson-deep"
            )}
          >
            <span className="font-bold">{notice.message}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-[11px] font-bold uppercase tracking-wider hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ACTION PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-8">
            <div className="mb-6 inline-flex items-center gap-1 rounded-lg border border-border bg-white p-1">
              {(
                [
                  { id: "borrow", label: "Borrow" },
                  { id: "earn", label: "Earn" },
                  { id: "collateral", label: "Collateral" },
                ] as { id: Tab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "rounded-md px-5 py-2 text-[13px] font-bold transition-colors",
                    activeTab === t.id
                      ? "bg-ink text-white"
                      : "text-ink2 hover:text-ink hover:bg-muted"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "borrow" && (
              <div className="flex flex-col gap-5">
                <ActionCard
                  title="Borrow stablecoin"
                  description={`Borrow ${market.loanSymbol} against posted collateral.`}
                  blocker={
                    isSettled ? "This market has settled — borrowing is closed." :
                    isBorrowCutoff ? "Borrowing is paused during the final 30 minutes before settlement." :
                    awaitingPrice ? "Live price not yet available; borrowing will be enabled shortly." : null
                  }
                  tone={isLastCall ? "hot" : "default"}
                >
                  <Input
                    label="Amount to borrow"
                    placeholder="0.00"
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    suffix={market.loanSymbol}
                    hint={`Wallet balance ${loanBalanceLabel}`}
                  />
                  <div className="grid grid-cols-2 gap-3 my-5 py-4 border-y border-border">
                    <MiniStat
                      label="Current debt"
                      value={position.borrowAssets > 0n ? `${formatTokenAmount(position.borrowAssets, market.loanDecimals, 4)} ${market.loanSymbol}` : "—"}
                    />
                    <MiniStat
                      label="Safety"
                      value={safetyLabel(position.healthFactor)}
                      tone={safetyToneVal}
                    />
                  </div>
                  <Button
                    size="lg"
                    variant={isLastCall ? "alarm" : "primary"}
                    fullWidth
                    loading={pendingAction === "Borrow"}
                    disabled={!borrowAmount || isSettled || isBorrowCutoff || awaitingPrice}
                    onClick={handleBorrow}
                  >
                    Borrow {market.loanSymbol}
                  </Button>
                </ActionCard>

                <ActionCard title="Repay" description="Pay back any amount, anytime.">
                  <Input
                    label="Amount to repay"
                    placeholder="0.00"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    suffix={market.loanSymbol}
                    onMax={() => setRepayAmount(formatTokenAmount(position.borrowAssets, market.loanDecimals, 6))}
                    hint={position.borrowAssets > 0n ? `Owe ${formatTokenAmount(position.borrowAssets, market.loanDecimals, 4)} ${market.loanSymbol}` : "No debt right now."}
                  />
                  <Button
                    size="lg"
                    variant="secondary"
                    fullWidth
                    loading={pendingAction === "Repay"}
                    disabled={!repayAmount || position.borrowAssets === 0n}
                    onClick={handleRepay}
                    className="mt-5"
                  >
                    Repay
                  </Button>
                </ActionCard>
              </div>
            )}

            {activeTab === "earn" && (
              <div className="flex flex-col gap-5">
                <ActionCard title="Lend stablecoin" description="Add USDC to this pool. Earn interest from borrowers.">
                  <Input
                    label="Amount to lend"
                    placeholder="0.00"
                    value={earnAmount}
                    onChange={(e) => setEarnAmount(e.target.value)}
                    suffix={market.loanSymbol}
                    onMax={() => setEarnAmount(formatTokenAmount(market.walletBalances.loan, market.loanDecimals, 6))}
                    hint={`Wallet balance ${loanBalanceLabel}`}
                  />
                  <div className="grid grid-cols-2 gap-3 my-5 py-4 border-y border-border">
                    <MiniStat label="Currently earning" value={position.supplyAssets > 0n ? `${formatTokenAmount(position.supplyAssets, market.loanDecimals, 4)} ${market.loanSymbol}` : "—"} />
                    <MiniStat label="APY" value={formatAPY(market.supplyApyPct)} tone="mint" />
                  </div>
                  <Button size="lg" variant="primary" fullWidth loading={pendingAction === "Lend"} disabled={!earnAmount} onClick={handleEarn}>
                    Lend {market.loanSymbol}
                  </Button>
                </ActionCard>

                <ActionCard title="Withdraw" description="Pull stablecoin out of the pool.">
                  <Input
                    label="Amount to withdraw"
                    placeholder="0.00"
                    value={withdrawEarnAmount}
                    onChange={(e) => setWithdrawEarnAmount(e.target.value)}
                    suffix={market.loanSymbol}
                    onMax={() => setWithdrawEarnAmount(formatTokenAmount(position.supplyAssets, market.loanDecimals, 6))}
                    hint={position.supplyAssets > 0n ? `Available ${formatTokenAmount(position.supplyAssets, market.loanDecimals, 4)} ${market.loanSymbol}` : "Nothing lent here yet."}
                  />
                  <Button size="lg" variant="secondary" fullWidth loading={pendingAction === "Withdraw"} disabled={!withdrawEarnAmount || position.supplyAssets === 0n} onClick={handleWithdrawEarn} className="mt-5">
                    Withdraw
                  </Button>
                </ActionCard>
              </div>
            )}

            {activeTab === "collateral" && (
              <div className="flex flex-col gap-5">
                <ActionCard title={`Post ${market.collateralSymbol}`} description="Deposit prediction-market tokens as collateral for this isolated market.">
                  <Input
                    label={`Amount of ${market.collateralSymbol}`}
                    placeholder="0.00"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    suffix={market.collateralSymbol}
                    onMax={() => setBetAmount(formatTokenAmount(market.walletBalances.collateral, market.collateralDecimals, 6))}
                    hint={`Wallet balance ${betBalanceLabel}`}
                  />
                  <div className="grid grid-cols-2 gap-3 my-5 py-4 border-y border-border">
                    <MiniStat label="Already posted" value={position.collateralAmount > 0n ? formatTokenAmount(position.collateralAmount, market.collateralDecimals, 4) : "—"} />
                    <MiniStat label="Valued at" value={position.collateralValueUsd > 0 ? formatUSD(position.collateralValueUsd) : "—"} />
                  </div>
                  <Button size="lg" variant="primary" fullWidth loading={pendingAction === "Add collateral"} disabled={!betAmount} onClick={handleAddBet}>
                    Post {market.collateralSymbol}
                  </Button>
                </ActionCard>

                <ActionCard title="Withdraw collateral" description="Withdraw available collateral while maintaining account health.">
                  <Input
                    label={`Amount of ${market.collateralSymbol}`}
                    placeholder="0.00"
                    value={withdrawBetAmount}
                    onChange={(e) => setWithdrawBetAmount(e.target.value)}
                    suffix={market.collateralSymbol}
                    onMax={() => setWithdrawBetAmount(formatTokenAmount(position.collateralAmount, market.collateralDecimals, 6))}
                    hint={position.collateralAmount > 0n ? `Posted ${formatTokenAmount(position.collateralAmount, market.collateralDecimals, 4)}` : "No collateral posted."}
                  />
                  <Button size="lg" variant="danger" fullWidth loading={pendingAction === "Take back"} disabled={!withdrawBetAmount || position.collateralAmount === 0n} onClick={handleTakeBet} className="mt-5">
                    Take back {market.collateralSymbol}
                  </Button>
                </ActionCard>
              </div>
            )}
          </div>

          {/* Right side: position card */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-white p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="eyebrow-xs">Your position</div>
                  {wallet.connected && <span className="live-mark forest" />}
                </div>

                {wallet.connected ? (
                  <>
                    <SafetyPanel
                      hf={position.healthFactor}
                      percent={safetyPct}
                      tone={safetyToneVal}
                      hasDebt={position.borrowAssets > 0n}
                    />
                    <div className="flex flex-col gap-3 mt-5 pt-5 border-t border-border text-[13px]">
                      <PosRow label="Lent" value={position.supplyAssets > 0n ? `${formatTokenAmount(position.supplyAssets, market.loanDecimals, 4)} ${market.loanSymbol}` : "—"} />
                      <PosRow label="Collateral" value={position.collateralAmount > 0n ? `${formatTokenAmount(position.collateralAmount, market.collateralDecimals, 4)} ${market.collateralSymbol}` : "—"} />
                      <PosRow label="Borrowed" value={position.borrowAssets > 0n ? `${formatTokenAmount(position.borrowAssets, market.loanDecimals, 4)} ${market.loanSymbol}` : "—"} />
                      <PosRow label="Collateral value" value={position.collateralValueUsd > 0 ? formatUSD(position.collateralValueUsd) : "—"} />
                    </div>
                  </>
                ) : (
                  <p className="text-[14px] text-ink2 leading-relaxed">{COPY.empty.notConnected}</p>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-5 text-[13px] leading-relaxed text-ink2">
                <div className="eyebrow-xs mb-2">Settlement</div>
                {market.resolutionTimestamp > 0 ? (
                  <p>
                    At resolution, winning {market.collateralSymbol} tokens
                    redeem against the settlement path. Unsafe debt can be
                    force-closed during the final two-hour window.
                  </p>
                ) : (
                  <p>
                    This market never expires. Borrow power stays flat. Standard
                    over-collateralized lending rules apply.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseBanner({ phase, outcomeBit }: { phase: MarketPhase; outcomeBit: number }) {
  if (phase === "last-call") {
    return (
      <div className="rounded-lg bg-crimson p-5 text-white">
        <div className="flex items-start gap-3">
          <span className="live-mark mt-1" style={{ background: "white" }} />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-80 mb-1">Last call</div>
            <p className="text-[14px] font-bold leading-relaxed">
              Final 2-hour window before settlement. Borrowing locked.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (phase === "settled") {
    const won = outcomeBit === 1;
    return (
      <div className="rounded-lg border border-border bg-white p-5">
        <div className="eyebrow-xs mb-1">Settled</div>
        <p className="font-display text-2xl font-extrabold text-ink leading-tight">
          {won ? "Yes" : outcomeBit === 2 ? "No" : "Outcome"} won
        </p>
        <p className="mt-2 text-[13px] text-ink2">
          Winning positions redeem 1:1 for stablecoin.
        </p>
      </div>
    );
  }
  if (phase === "narrowing") {
    return (
      <div className="rounded-lg border border-amber/30 bg-amber-soft p-5">
        <div className="flex items-start gap-3">
          <span className="live-mark warn mt-1" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-deep mb-1">Narrowing</div>
            <p className="text-[14px] text-ink leading-relaxed font-medium">
              Borrow power has begun tightening. Reaches zero at settlement.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: "leaf" | "coral" }) {
  const c = accent === "leaf" ? "text-leaf" : accent === "coral" ? "text-coral" : "text-ink";
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-[13px] font-medium text-ink2">{label}</span>
      <span className={cn("numerals font-extrabold text-[15px]", c)}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "mint" | "lime" | "signal" | "alarm" | "hot" }) {
  const c = tone === "mint" || tone === "lime" ? "text-leaf"
    : tone === "signal" ? "text-amber-deep"
    : tone === "alarm" || tone === "hot" ? "text-crimson"
    : "text-ink";
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="eyebrow-xs mb-1">{label}</div>
      <div className={cn("numerals text-[15px] font-extrabold", c)}>{value}</div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  blocker,
  tone,
  children,
}: {
  title: string;
  description?: string;
  blocker?: string | null;
  tone?: "default" | "hot";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-6",
        tone === "hot" ? "border-crimson/40" : "border-border"
      )}
    >
      <div className="mb-5">
        <h3 className="font-display text-[20px] font-extrabold text-ink">{title}</h3>
        {description && (
          <p className="mt-1 text-[13px] text-ink2 leading-relaxed">{description}</p>
        )}
      </div>
      {blocker && (
        <div className="mb-5 rounded-lg bg-crimson-soft px-4 py-3 text-[13px] font-bold text-crimson-deep">
          {blocker}
        </div>
      )}
      {children}
    </div>
  );
}

function SafetyPanel({ hf, percent, tone, hasDebt }: { hf: number; percent: number; tone: "mint" | "signal" | "alarm"; hasDebt: boolean }) {
  if (!hasDebt) {
    return (
      <div>
        <div className="text-2xl font-extrabold text-ink">No debt</div>
        <p className="mt-1 text-[12px] text-ink3">No active borrow in this market.</p>
      </div>
    );
  }

  const label = safetyLabel(hf);
  const c = tone === "mint" ? "text-leaf" : tone === "signal" ? "text-amber-deep" : "text-crimson";
  const meterTone: "leaf" | "crimson" | "amber" =
    tone === "mint" ? "leaf" : tone === "alarm" ? "crimson" : "amber";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className={cn("font-display text-2xl font-extrabold", c)}>{label}</span>
        <span className="text-[11px] font-bold text-ink3 uppercase tracking-wider numerals">
          {percent.toFixed(0)}% safety
        </span>
      </div>
      <Meter value={percent} tone={meterTone} />
      <p className="mt-3 text-[12px] text-ink3 leading-relaxed">
        {tone === "alarm"
          ? "Repay or add collateral to restore account health."
          : tone === "signal"
          ? "Account health is close to the liquidation threshold."
          : "Account health is above the current risk threshold."}
      </p>
    </div>
  );
}

function PosRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink3 text-[13px] font-medium">{label}</span>
      <span className="numerals text-ink font-bold">{value}</span>
    </div>
  );
}

export default function MarketDetailPage() {
  return (
    <Suspense fallback={null}>
      <MarketDetailPageInner />
    </Suspense>
  );
}
