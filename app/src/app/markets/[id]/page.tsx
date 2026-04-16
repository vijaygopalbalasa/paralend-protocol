"use client";

import Link from "next/link";
import { BN } from "@coral-xyz/anchor";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DecayCurveChart } from "@/components/DecayCurveChart";
import { Input } from "@/components/ui/input";
import { ResolutionCountdown } from "@/components/ResolutionCountdown";
import { Stat } from "@/components/ui/stat";
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
  cn,
  formatAPY,
  formatHealthFactor,
  formatPct,
  formatUSD,
  healthFactorBg,
  utilizationColor,
} from "@/lib/utils";

type Tab = "supply" | "borrow" | "collateral";
type Notice =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function MarketDetailPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const wallet = useWallet();
  const marketAddress = typeof params.id === "string" ? params.id : null;
  const requestedTab = (searchParams.get("tab") as Tab) || "supply";

  const { market, loading, error, reload } = useMarketDetail(marketAddress);

  const [activeTab, setActiveTab] = useState<Tab>(requestedTab);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [supplyAmount, setSupplyAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [collateralDeposit, setCollateralDeposit] = useState("");
  const [collateralWithdraw, setCollateralWithdraw] = useState("");

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  const loanBalanceLabel =
    market &&
    `${formatTokenAmount(
      market.walletBalances.loan,
      market.loanDecimals,
      4
    )} ${market.loanSymbol}`;
  const collateralBalanceLabel =
    market &&
    `${formatTokenAmount(
      market.walletBalances.collateral,
      market.collateralDecimals,
      4
    )} ${market.collateralSymbol}`;

  const runAction = async (
    action: string,
    buildTransaction: () => Promise<Transaction>
  ) => {
    const anchorWallet = toAnchorWallet(wallet);
    if (!anchorWallet) {
      setNotice({
        type: "error",
        message: "Connect a wallet that supports transaction signing.",
      });
      return;
    }

    setPendingAction(action);
    setNotice(null);
    try {
      const provider = makeAnchorProvider(connection, anchorWallet);
      const tx = await buildTransaction();
      const signature = await provider.sendAndConfirm(tx, []);
      setNotice({
        type: "success",
        message: `${action} confirmed: ${signature.slice(0, 12)}...`,
      });
      await reload();
    } catch (txError) {
      setNotice({ type: "error", message: getErrorMessage(txError) });
    } finally {
      setPendingAction(null);
    }
  };

  const withProgram = () => {
    const anchorWallet = toAnchorWallet(wallet);
    if (!anchorWallet || !market) {
      throw new Error("Wallet and market must both be available.");
    }

    const program = makeProgram(connection, anchorWallet);
    const owner = anchorWallet.publicKey;
    const positionPda = derivePositionPDA(market.marketId, owner);
    const loanVault = deriveLoanVaultPDA(market.marketId);
    const collateralVault = deriveCollateralVaultPDA(market.marketId);
    const priceCache = derivePriceCachePDA(market.marketId);
    const protocolState = deriveProtocolStatePDA();

    return {
      owner,
      program,
      positionPda,
      loanVault,
      collateralVault,
      priceCache,
      protocolState,
    };
  };

  const createPositionIx = async () => {
    if (!market || market.position.exists) {
      return null;
    }

    const { program, owner, positionPda } = withProgram();
    const methods = program.methods as any;
    return methods
      .createPosition(Array.from(market.marketId))
      .accountsPartial({
        payer: owner,
        owner,
        market: market.publicKey,
        position: positionPda,
      })
      .instruction();
  };

  const handleSupply = async () => {
    if (!market) return;
    const amount = parseTokenAmount(supplyAmount, market.loanDecimals);
    if (!amount || amount <= 0n) {
      setNotice({ type: "error", message: "Enter a valid supply amount." });
      return;
    }

    await runAction("Supply", async () => {
      const { owner, program, positionPda, loanVault, protocolState } =
        withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address: loanAta, instruction: ensureLoanAtaIx } = ensureAtaIx(
        market.loanMint,
        owner,
        owner
      );
      tx.add(ensureLoanAtaIx);
      const maybeCreatePosition = await createPositionIx();
      if (maybeCreatePosition) tx.add(maybeCreatePosition);
      tx.add(
        await methods
          .supply(Array.from(market.marketId), new BN(amount.toString()), new BN(0))
          .accountsPartial({
            supplier: owner,
            protocolState,
            market: market.publicKey,
            irm: market.irm,
            position: positionPda,
            supplierLoanAta: loanAta,
            loanVault,
          })
          .instruction()
      );
      return tx;
    });

    setSupplyAmount("");
  };

  const handleWithdraw = async () => {
    if (!market) return;
    const amount = parseTokenAmount(withdrawAmount, market.loanDecimals);
    if (!amount || amount <= 0n) {
      setNotice({ type: "error", message: "Enter a valid withdraw amount." });
      return;
    }

    await runAction("Withdraw", async () => {
      const { owner, program, positionPda, loanVault } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address: loanAta, instruction: ensureLoanAtaIx } = ensureAtaIx(
        market.loanMint,
        owner,
        owner
      );
      tx.add(ensureLoanAtaIx);
      tx.add(
        await methods
          .withdraw(
            Array.from(market.marketId),
            new BN(amount.toString()),
            new BN(0),
            new BN(0),
            new BN(0)
          )
          .accountsPartial({
            owner,
            market: market.publicKey,
            irm: market.irm,
            position: positionPda,
            loanVault,
            receiverLoanAta: loanAta,
          })
          .instruction()
      );
      return tx;
    });

    setWithdrawAmount("");
  };

  const handleBorrow = async () => {
    if (!market) return;
    const amount = parseTokenAmount(borrowAmount, market.loanDecimals);
    if (!amount || amount <= 0n) {
      setNotice({ type: "error", message: "Enter a valid borrow amount." });
      return;
    }

    await runAction("Borrow", async () => {
      const {
        owner,
        program,
        positionPda,
        loanVault,
        priceCache,
        protocolState,
      } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address: loanAta, instruction: ensureLoanAtaIx } = ensureAtaIx(
        market.loanMint,
        owner,
        owner
      );
      tx.add(ensureLoanAtaIx);
      const maybeCreatePosition = await createPositionIx();
      if (maybeCreatePosition) tx.add(maybeCreatePosition);
      tx.add(
        await methods
          .borrow(Array.from(market.marketId), new BN(amount.toString()), new BN(0))
          .accountsPartial({
            borrower: owner,
            protocolState,
            market: market.publicKey,
            irm: market.irm,
            position: positionPda,
            loanVault,
            receiverLoanAta: loanAta,
            priceCache,
          })
          .instruction()
      );
      return tx;
    });

    setBorrowAmount("");
  };

  const handleRepay = async () => {
    if (!market) return;
    const amount = parseTokenAmount(repayAmount, market.loanDecimals);
    if (!amount || amount <= 0n) {
      setNotice({ type: "error", message: "Enter a valid repay amount." });
      return;
    }

    await runAction("Repay", async () => {
      const { owner, program, positionPda, loanVault } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const { address: loanAta, instruction: ensureLoanAtaIx } = ensureAtaIx(
        market.loanMint,
        owner,
        owner
      );
      tx.add(ensureLoanAtaIx);
      tx.add(
        await methods
          .repay(
            Array.from(market.marketId),
            new BN(amount.toString()),
            new BN(0)
          )
          .accountsPartial({
            repayer: owner,
            market: market.publicKey,
            irm: market.irm,
            position: positionPda,
            borrower: owner,
            repayerLoanAta: loanAta,
            loanVault,
          })
          .instruction()
      );
      return tx;
    });

    setRepayAmount("");
  };

  const handleDepositCollateral = async () => {
    if (!market) return;
    const amount = parseTokenAmount(collateralDeposit, market.collateralDecimals);
    if (!amount || amount <= 0n) {
      setNotice({
        type: "error",
        message: "Enter a valid collateral deposit amount.",
      });
      return;
    }

    await runAction("Deposit Collateral", async () => {
      const { owner, program, positionPda, collateralVault, protocolState } =
        withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const {
        address: collateralAta,
        instruction: ensureCollateralAtaIx,
      } = ensureAtaIx(market.collateralMint, owner, owner);
      tx.add(ensureCollateralAtaIx);
      const maybeCreatePosition = await createPositionIx();
      if (maybeCreatePosition) tx.add(maybeCreatePosition);
      tx.add(
        await methods
          .supplyCollateral(Array.from(market.marketId), new BN(amount.toString()))
          .accountsPartial({
            depositor: owner,
            protocolState,
            market: market.publicKey,
            position: positionPda,
            depositorCollateralAta: collateralAta,
            collateralVault,
          })
          .instruction()
      );
      return tx;
    });

    setCollateralDeposit("");
  };

  const handleWithdrawCollateral = async () => {
    if (!market) return;
    const amount = parseTokenAmount(collateralWithdraw, market.collateralDecimals);
    if (!amount || amount <= 0n) {
      setNotice({
        type: "error",
        message: "Enter a valid collateral withdrawal amount.",
      });
      return;
    }

    await runAction("Withdraw Collateral", async () => {
      const {
        owner,
        program,
        positionPda,
        collateralVault,
        priceCache,
        
      } = withProgram();
      const methods = program.methods as any;
      const tx = new Transaction();
      const {
        address: collateralAta,
        instruction: ensureCollateralAtaIx,
      } = ensureAtaIx(market.collateralMint, owner, owner);
      tx.add(ensureCollateralAtaIx);
      tx.add(
        await methods
          .withdrawCollateral(
            Array.from(market.marketId),
            new BN(amount.toString())
          )
          .accountsPartial({
            owner,
            market: market.publicKey,
            irm: market.irm,
            position: positionPda,
            collateralVault,
            receiverCollateralAta: collateralAta,
            priceCache,
            
          })
          .instruction()
      );
      return tx;
    });

    setCollateralWithdraw("");
  };

  if (loading && !market) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-paralend-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-sm text-paralend-text-secondary">
          {error ?? "Market not found."}
        </p>
        <Link href="/markets">
          <Button variant="secondary">Back to Markets</Button>
        </Link>
      </div>
    );
  }

  const position = market.position;
  const tabs: { id: Tab; label: string }[] = [
    { id: "supply", label: "Supply" },
    { id: "borrow", label: "Borrow" },
    { id: "collateral", label: "Collateral" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm font-medium text-paralend-text-secondary">
        <Link href="/markets" className="hover:text-paralend-primary transition-colors">
          Markets
        </Link>
        <span className="mx-2">/</span>
        <span className="font-bold text-paralend-text-primary">
          {market.collateralSymbol} / {market.loanSymbol}
        </span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-2">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white shadow-sm text-2xl z-10">
              {market.collateralIcon}
            </span>
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-gray-50 shadow-sm text-2xl">
              {market.loanIcon}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-paralend-text-primary tracking-tight">
              {market.kalshiTicker || `${market.collateralSymbol} / ${market.loanSymbol}`}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="gray">LLTV {market.lltv}%</Badge>
              <Badge variant="gray">Fee {(market.feeBps / 100).toFixed(2)}%</Badge>
              <ResolutionCountdown
                resolutionTimestamp={market.resolutionTimestamp}
                marketStatus={market.marketStatus}
                outcomeBit={market.outcomeBit}
              />
              <span className="text-xs font-semibold text-paralend-text-secondary">
                {market.oracleLabel}
              </span>
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={() => reload()}>
          Refresh
        </Button>
      </div>

      {notice && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium shadow-sm",
            notice.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-600"
          )}
        >
          {notice.message}
        </div>
      )}

      {market.resolutionTimestamp > 0 && (
        <DecayCurveChart
          baseLltvBps={market.baseLltvBps}
          resolutionTimestamp={market.resolutionTimestamp}
          marketStatus={market.marketStatus}
        />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card noPadding innerClassName="p-5">
          <Stat
            label="Supply APY"
            value={formatAPY(market.supplyApyPct)}
            valueClassName="text-paralend-green font-black tracking-tight text-2xl"
          />
        </Card>
        <Card noPadding innerClassName="p-5">
          <Stat
            label="Borrow APY"
            value={formatAPY(market.borrowApyPct)}
            valueClassName="text-paralend-orange font-black tracking-tight text-2xl"
          />
        </Card>
        <Card noPadding innerClassName="p-5">
          <Stat label="TVL" value={formatUSD(market.tvlUsd)} valueClassName="font-black tracking-tight text-2xl" />
        </Card>
        <Card noPadding innerClassName="p-5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-paralend-text-secondary">
              Utilization
            </span>
            <span className="text-2xl font-black tabular-nums text-paralend-text-primary tracking-tight">
              {formatPct(market.utilization)}
            </span>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#FAFAFA] border border-paralend-border/50">
              <div
                className={`h-full rounded-full ${utilizationColor(market.utilization)} transition-all duration-500`}
                style={{ width: `${Math.min(market.utilization, 100)}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mt-4">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="flex gap-1 rounded-lg border border-paralend-border bg-gray-50 p-1.5 shadow-inner">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 rounded-md py-2.5 text-sm font-bold transition-all",
                  activeTab === tab.id
                    ? "bg-white text-paralend-primary shadow-sm ring-1 ring-gray-900/5"
                    : "text-paralend-text-secondary hover:text-paralend-text-primary hover:bg-gray-100/50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "supply" && (
            <div className="flex flex-col gap-4">
              <Card header={<span className="font-semibold text-paralend-text-primary">Supply {market.loanSymbol}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loanSymbol})`}
                    type="number"
                    placeholder="0.00"
                    value={supplyAmount}
                    onChange={(event) => setSupplyAmount(event.target.value)}
                    suffix={market.loanSymbol}
                    onMax={() =>
                      setSupplyAmount(
                        formatTokenAmount(market.walletBalances.loan, market.loanDecimals, 6)
                      )
                    }
                    hint={`Wallet balance: ${loanBalanceLabel ?? "—"}`}
                  />
                  <div className="rounded-lg border border-paralend-border bg-paralend-bg p-4 text-sm">
                    <div className="flex justify-between text-paralend-text-secondary">
                      <span>Your supplied</span>
                      <span className="font-medium text-paralend-text-primary">
                        {position.supplyAssets > 0n
                          ? `${formatTokenAmount(position.supplyAssets, market.loanDecimals, 6)} ${market.loanSymbol}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={pendingAction === "Supply"}
                    disabled={!supplyAmount}
                    onClick={handleSupply}
                  >
                    Supply {market.loanSymbol}
                  </Button>
                </div>
              </Card>

              <Card header={<span className="font-semibold text-paralend-text-primary">Withdraw {market.loanSymbol}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loanSymbol})`}
                    type="number"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(event.target.value)}
                    suffix={market.loanSymbol}
                    onMax={() =>
                      setWithdrawAmount(
                        formatTokenAmount(position.supplyAssets, market.loanDecimals, 6)
                      )
                    }
                    hint={`Currently supplied: ${
                      position.supplyAssets > 0n
                        ? `${formatTokenAmount(position.supplyAssets, market.loanDecimals, 6)} ${market.loanSymbol}`
                        : "—"
                    }`}
                  />
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    loading={pendingAction === "Withdraw"}
                    disabled={!withdrawAmount || position.supplyAssets === 0n}
                    onClick={handleWithdraw}
                  >
                    Withdraw {market.loanSymbol}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "borrow" && (
            <div className="flex flex-col gap-4">
              {(() => {
                // Mirrors on-chain POST_BORROW_CUTOFF_SECONDS (30 min) +
                // "awaiting attester" check: block the UI before the
                // program rejects the tx so users don't burn fees on
                // guaranteed reverts.
                const now = Math.floor(Date.now() / 1000);
                const remaining = market.resolutionTimestamp - now;
                const inCutoff =
                  market.resolutionTimestamp > 0 && remaining <= 1800;
                const resolved = market.marketStatus === 2 || market.paused;
                const noOracle = market.collateralPriceWad === 0n;

                // Client-side health preview: mirrors is_position_healthy.
                // If the user-entered borrow amount would fail the
                // time-decayed LLTV check on-chain, surface it before we
                // waste a signature. Uses the same effective-LLTV formula
                // as the decay chart for visible consistency.
                let healthBlocker: string | null = null;
                const amountBase = borrowAmount
                  ? BigInt(
                      Math.floor(
                        parseFloat(borrowAmount) * 10 ** market.loanDecimals
                      )
                    )
                  : 0n;
                if (amountBase > 0n && !resolved && !inCutoff && !noOracle) {
                  const WAD_LOCAL = 10n ** 18n;
                  const BPS_LOCAL = 10_000n;
                  const MAX_BINARY_LLTV_BPS_LOCAL = 7_000n;
                  const DECAY_START = 7 * 24 * 3600;
                  const baseBps = BigInt(
                    Math.floor(market.baseLltvBps ?? market.lltv * 100)
                  );
                  const capped =
                    baseBps > MAX_BINARY_LLTV_BPS_LOCAL
                      ? MAX_BINARY_LLTV_BPS_LOCAL
                      : baseBps;
                  let effBps: bigint;
                  if (market.resolutionTimestamp === 0) {
                    effBps = capped;
                  } else if (remaining <= 0) {
                    effBps = 0n;
                  } else if (remaining >= DECAY_START) {
                    effBps = capped;
                  } else {
                    effBps =
                      (capped * BigInt(remaining)) / BigInt(DECAY_START);
                  }
                  const collateralUsd =
                    (position.collateralAmount * market.collateralPriceWad) /
                    WAD_LOCAL;
                  const futureDebt = position.borrowAssets + amountBase;
                  const loanUsd =
                    (futureDebt * market.loanPriceWad + WAD_LOCAL - 1n) /
                    WAD_LOCAL;
                  const lhs = collateralUsd * effBps;
                  const rhs = loanUsd * BPS_LOCAL;
                  if (loanUsd > 0n && lhs < rhs) {
                    healthBlocker = `Position would be unhealthy after borrow at the current effective LLTV (${(
                      Number(effBps) / 100
                    ).toFixed(1)}%). Reduce the amount or add more collateral.`;
                  }
                }

                const blocker = resolved
                  ? "This market is resolved — borrow is closed. Winning positions can redeem; losing positions have been force-closed."
                  : inCutoff
                    ? "Borrow is paused inside the final 30 minutes before resolution. Existing borrowers can still repay and withdraw."
                    : noOracle
                      ? "No attested price yet — the attester daemon has not pushed an initial spot. Borrow unavailable until then."
                      : healthBlocker;
                return blocker ? (
                  <div className="rounded-lg border border-paralend-orange/40 bg-paralend-orange/10 p-3 text-sm font-semibold text-paralend-orange">
                    {blocker}
                  </div>
                ) : null;
              })()}
              <Card header={<span className="font-semibold text-paralend-text-primary">Borrow {market.loanSymbol}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loanSymbol})`}
                    type="number"
                    placeholder="0.00"
                    value={borrowAmount}
                    onChange={(event) => setBorrowAmount(event.target.value)}
                    suffix={market.loanSymbol}
                    hint={`Wallet balance: ${loanBalanceLabel ?? "—"}`}
                  />
                  <div className="rounded-lg border border-paralend-border bg-paralend-bg p-4 text-sm">
                    <div className="flex justify-between text-paralend-text-secondary">
                      <span>Collateral posted</span>
                      <span className="font-medium text-paralend-text-primary">
                        {position.collateralAmount > 0n
                          ? `${formatTokenAmount(position.collateralAmount, market.collateralDecimals, 6)} ${market.collateralSymbol}`
                          : "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-paralend-text-secondary">
                      <span>Outstanding debt</span>
                      <span className="font-medium text-paralend-text-primary">
                        {position.borrowAssets > 0n
                          ? `${formatTokenAmount(position.borrowAssets, market.loanDecimals, 6)} ${market.loanSymbol}`
                          : "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-paralend-text-secondary">
                      <span>Health factor</span>
                      <span
                        className={cn(
                          "rounded border px-2 py-0.5 text-base font-bold",
                          healthFactorBg(position.healthFactor)
                        )}
                      >
                        {formatHealthFactor(position.healthFactor)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={pendingAction === "Borrow"}
                    disabled={
                      !borrowAmount ||
                      market.marketStatus === 2 ||
                      market.paused ||
                      market.collateralPriceWad === 0n ||
                      (market.resolutionTimestamp > 0 &&
                        market.resolutionTimestamp - Math.floor(Date.now() / 1000) <=
                          1800)
                    }
                    onClick={handleBorrow}
                  >
                    Borrow {market.loanSymbol}
                  </Button>
                </div>
              </Card>

              <Card header={<span className="font-semibold text-paralend-text-primary">Repay {market.loanSymbol}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.loanSymbol})`}
                    type="number"
                    placeholder="0.00"
                    value={repayAmount}
                    onChange={(event) => setRepayAmount(event.target.value)}
                    suffix={market.loanSymbol}
                    onMax={() =>
                      setRepayAmount(
                        formatTokenAmount(position.borrowAssets, market.loanDecimals, 6)
                      )
                    }
                    hint={`Outstanding debt: ${
                      position.borrowAssets > 0n
                        ? `${formatTokenAmount(position.borrowAssets, market.loanDecimals, 6)} ${market.loanSymbol}`
                        : "—"
                    }`}
                  />
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    loading={pendingAction === "Repay"}
                    disabled={!repayAmount || position.borrowAssets === 0n}
                    onClick={handleRepay}
                  >
                    Repay {market.loanSymbol}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "collateral" && (
            <div className="flex flex-col gap-4">
              <Card header={<span className="font-semibold text-paralend-text-primary">Deposit {market.collateralSymbol}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.collateralSymbol})`}
                    type="number"
                    placeholder="0.00"
                    value={collateralDeposit}
                    onChange={(event) => setCollateralDeposit(event.target.value)}
                    suffix={market.collateralSymbol}
                    onMax={() =>
                      setCollateralDeposit(
                        formatTokenAmount(
                          market.walletBalances.collateral,
                          market.collateralDecimals,
                          6
                        )
                      )
                    }
                    hint={`Wallet balance: ${collateralBalanceLabel ?? "—"}`}
                  />
                  <div className="rounded-lg border border-paralend-border bg-paralend-bg p-4 text-sm">
                    <div className="flex justify-between text-paralend-text-secondary">
                      <span>Current collateral</span>
                      <span className="font-medium text-paralend-text-primary">
                        {position.collateralAmount > 0n
                          ? `${formatTokenAmount(position.collateralAmount, market.collateralDecimals, 6)} ${market.collateralSymbol}`
                          : "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-paralend-text-secondary">
                      <span>Collateral value</span>
                      <span className="font-medium text-paralend-text-primary">
                        {position.collateralValueUsd > 0
                          ? formatUSD(position.collateralValueUsd)
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={pendingAction === "Deposit Collateral"}
                    disabled={!collateralDeposit}
                    onClick={handleDepositCollateral}
                  >
                    Deposit {market.collateralSymbol}
                  </Button>
                </div>
              </Card>

              <Card header={<span className="font-semibold text-paralend-text-primary">Withdraw {market.collateralSymbol}</span>}>
                <div className="flex flex-col gap-4">
                  <Input
                    label={`Amount (${market.collateralSymbol})`}
                    type="number"
                    placeholder="0.00"
                    value={collateralWithdraw}
                    onChange={(event) => setCollateralWithdraw(event.target.value)}
                    suffix={market.collateralSymbol}
                    onMax={() =>
                      setCollateralWithdraw(
                        formatTokenAmount(
                          position.collateralAmount,
                          market.collateralDecimals,
                          6
                        )
                      )
                    }
                    hint={`Posted: ${
                      position.collateralAmount > 0n
                        ? `${formatTokenAmount(position.collateralAmount, market.collateralDecimals, 6)} ${market.collateralSymbol}`
                        : "—"
                    }`}
                  />
                  <div className="rounded-lg border border-paralend-red/20 bg-paralend-red/5 p-3 text-xs text-paralend-red/80">
                    Withdrawing collateral can make the position liquidatable if the
                    health factor drops below 1.0.
                  </div>
                  <Button
                    variant="danger"
                    size="lg"
                    fullWidth
                    loading={pendingAction === "Withdraw Collateral"}
                    disabled={!collateralWithdraw || position.collateralAmount === 0n}
                    onClick={handleWithdrawCollateral}
                  >
                    Withdraw {market.collateralSymbol}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card header={<span className="font-semibold text-paralend-text-primary">Your Position</span>}>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-paralend-text-secondary">Supplied</span>
                <span className="font-medium text-paralend-text-primary">
                  {position.supplyAssets > 0n
                    ? `${formatTokenAmount(position.supplyAssets, market.loanDecimals, 6)} ${market.loanSymbol}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-paralend-text-secondary">Borrowed</span>
                <span className="font-medium text-paralend-text-primary">
                  {position.borrowAssets > 0n
                    ? `${formatTokenAmount(position.borrowAssets, market.loanDecimals, 6)} ${market.loanSymbol}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-paralend-text-secondary">Collateral</span>
                <span className="font-medium text-paralend-text-primary">
                  {position.collateralAmount > 0n
                    ? `${formatTokenAmount(position.collateralAmount, market.collateralDecimals, 6)} ${market.collateralSymbol}`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-paralend-text-secondary">Health factor</span>
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 font-bold",
                    healthFactorBg(position.healthFactor)
                  )}
                >
                  {formatHealthFactor(position.healthFactor)}
                </span>
              </div>
            </div>
          </Card>

          <Card header={<span className="font-semibold text-paralend-text-primary">Market Parameters</span>}>
            <div className="flex flex-col gap-3 text-sm">
              {[
                { label: "Collateral", value: market.collateralSymbol },
                { label: "Loan", value: market.loanSymbol },
                { label: "LLTV", value: `${market.lltv}%` },
                { label: "Oracle", value: market.oracleLabel },
                { label: "IRM", value: market.irm.toBase58().slice(0, 8) + "..." },
                { label: "Fee", value: `${(market.feeBps / 100).toFixed(2)}%` },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-b border-paralend-border/50 py-2 last:border-0"
                >
                  <span className="text-paralend-text-secondary">{row.label}</span>
                  <span className="text-right font-medium text-paralend-text-primary">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card header={<span className="font-semibold text-paralend-text-primary">Liquidation</span>}>
            <div className="flex flex-col gap-2 text-sm text-paralend-text-secondary">
              <p>
                A position becomes liquidatable once its health factor drops below
                1.0.
              </p>
              <div className="flex justify-between">
                <span>Collateral price</span>
                <span className="font-medium text-paralend-text-primary">
                  {formatUSD(market.collateralPriceUsd)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Loan price</span>
                <span className="font-medium text-paralend-text-primary">
                  {formatUSD(market.loanPriceUsd)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Current borrowed</span>
                <span className="font-medium text-paralend-text-primary">
                  {formatUSD(market.borrowedUsd)}
                </span>
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
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-paralend-primary border-t-transparent" />
        </div>
      }
    >
      <MarketDetailPageInner />
    </Suspense>
  );
}
