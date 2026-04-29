"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/meter";
import { NumberTicker } from "@/components/ui/number-ticker";
import { formatUSD, cn } from "@/lib/utils";
import { usePositions, type PositionRow } from "@/hooks/usePositions";
import {
  deriveCollateralVaultPDA,
  deriveLoanVaultPDA,
  deriveMarketPDA,
  derivePositionPDA,
  derivePriceCachePDA,
  ensureAtaIx,
  formatTokenAmount,
  makeAnchorProvider,
  makeProgram,
  toAnchorWallet,
} from "@/lib/paralend-program";
import { useMarkets, type MarketRow } from "@/hooks/useMarkets";
import {
  COPY,
  formatDuration,
  marketPhase,
  safetyLabel,
  safetyScore,
  safetyTone,
} from "@/lib/copy";

type Notice =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function PositionsPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected } = wallet;
  const { positions, loading, reload } = usePositions(15_000);
  const { markets } = useMarkets(30_000);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const marketsByKey = useMemo(() => {
    const m = new Map<string, MarketRow>();
    for (const mk of markets) m.set(mk.publicKey, mk);
    return m;
  }, [markets]);

  const aggregate = useMemo(() => {
    const totalLent = positions.reduce((s, p) => s + p.supplyAssetsUsd, 0);
    const totalBorrowed = positions.reduce((s, p) => s + p.borrowAssetsUsd, 0);
    const totalCollateral = positions.reduce(
      (s, p) => s + p.collateralValueUsd,
      0
    );
    const netEquity = totalLent + totalCollateral - totalBorrowed;
    return { totalLent, totalBorrowed, totalCollateral, netEquity };
  }, [positions]);

  const lastCallPositions = useMemo(() => {
    return positions.filter((p) => {
      const m = marketsByKey.get(p.marketPubkey);
      if (!m) return false;
      return marketPhase(m.resolutionTimestamp, m.marketStatus) === "last-call";
    });
  }, [positions, marketsByKey]);

  const handleForceClose = async (row: PositionRow) => {
    const anchorWallet = toAnchorWallet(wallet);
    if (!anchorWallet) {
      setNotice({ type: "error", message: "Connect a wallet first." });
      return;
    }
    const market = marketsByKey.get(row.marketPubkey);
    if (!market) {
      setNotice({ type: "error", message: "Market data not loaded yet." });
      return;
    }
    setPendingAction(`fc:${row.publicKey}`);
    setNotice(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const marketAccount = await program.account.market.fetch(row.marketPubkey);
      const methods = program.methods as any;
      const posAccount = await program.account.position.fetch(row.publicKey);
      const borrower = posAccount.owner;
      const marketId = Buffer.from(posAccount.marketId as number[]);

      const marketPda = deriveMarketPDA(marketId);
      const positionPda = derivePositionPDA(marketId, borrower);
      const loanVault = deriveLoanVaultPDA(marketId);
      const collateralVault = deriveCollateralVaultPDA(marketId);
      const priceCache = derivePriceCachePDA(marketId);

      const provider = makeAnchorProvider(connection, anchorWallet);
      const tx = new Transaction();
      const { address: liquidatorLoanAta, instruction: loanAtaIx } =
        ensureAtaIx(marketAccount.loanMint, anchorWallet.publicKey, anchorWallet.publicKey);
      const { address: liquidatorCollateralAta, instruction: collAtaIx } =
        ensureAtaIx(marketAccount.collateralMint, anchorWallet.publicKey, anchorWallet.publicKey);
      tx.add(loanAtaIx);
      tx.add(collAtaIx);
      tx.add(
        await methods
          .forceClosePosition(Array.from(marketId))
          .accountsPartial({
            liquidator: anchorWallet.publicKey,
            market: marketPda,
            irm: marketAccount.irm,
            borrowerPosition: positionPda,
            borrower,
            liquidatorLoanAta,
            loanVault,
            collateralVault,
            liquidatorCollateralAta,
            priceCache,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction()
      );
      const sig = await provider.sendAndConfirm(tx, []);
      setNotice({
        type: "success",
        message: `Last-call close confirmed · ${sig.slice(0, 10)}…`,
      });
      await reload();
    } catch (err) {
      setNotice({ type: "error", message: errorMessage(err) });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 lg:px-10 md:py-10">
      <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="eyebrow-xs mb-2 inline-block">Portfolio</span>
          <h1 className="text-[30px] font-extrabold leading-tight text-ink md:text-[40px]">
            Positions
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink2 md:text-[15px]">
            Review supplied assets, posted collateral, borrow balances, and
            account health across all markets.
          </p>
        </div>
        <Link href="/markets">
          <Button variant="primary" size="md">
            Open position
          </Button>
        </Link>
      </div>

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

      {!connected && (
        <div className="rounded-lg border border-border bg-white p-12 text-center">
          <h3 className="mb-2 text-2xl font-extrabold text-ink">
            Connect your wallet
          </h3>
          <p className="text-[15px] text-ink2 max-w-md mx-auto leading-relaxed mb-7">
            {COPY.empty.notConnected}
          </p>
          <Link href="/markets">
            <Button variant="primary">Browse markets</Button>
          </Link>
        </div>
      )}

      {connected && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Net value", value: aggregate.netEquity, accent: aggregate.netEquity >= 0 ? undefined : "coral" as const },
              { label: "Lent", value: aggregate.totalLent, accent: "leaf" as const },
              { label: "Collateral", value: aggregate.totalCollateral },
              { label: "Borrowed", value: aggregate.totalBorrowed, accent: "coral" as const },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-white p-4">
                <div className="eyebrow-xs mb-2">{s.label}</div>
                <div
                  className={cn(
                    "numerals text-[24px] font-bold leading-none md:text-[30px]",
                    s.accent === "coral" && "text-coral",
                    s.accent === "leaf" && "text-leaf"
                  )}
                >
                  <NumberTicker value={s.value} currency />
                </div>
              </div>
            ))}
          </div>

          {lastCallPositions.length > 0 && (
            <div className="mb-6 rounded-lg border border-crimson/30 bg-crimson-soft p-5 text-crimson-deep">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider">Last call</div>
                  <h3 className="mb-2 text-[18px] font-extrabold leading-tight">
                    {lastCallPositions.length} position{lastCallPositions.length > 1 ? "s" : ""} in the final window
                  </h3>
                  <p className="text-[14px] leading-relaxed max-w-2xl opacity-90">
                    These markets settle in under 2 hours. Borrow power is
                    tightening. Anyone can close unsafe positions for a bounty.
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading && positions.length === 0 && (
            <div className="py-16 text-center">
              <span className="text-ink3">Loading your positions...</span>
            </div>
          )}

          {!loading && positions.length === 0 && (
            <div className="rounded-lg border border-border bg-white p-12 text-center">
              <h3 className="mb-2 text-2xl font-extrabold text-ink">
                No positions yet
              </h3>
              <p className="text-[15px] text-ink2 max-w-md mx-auto mb-7">
                {COPY.empty.noPositions} Start by posting collateral or lending into a pool.
              </p>
              <Link href="/markets">
                <Button variant="primary">Browse markets</Button>
              </Link>
            </div>
          )}

          {positions.length > 0 && (
            <div className="flex flex-col gap-4">
              {positions.map((position) => {
                const market = marketsByKey.get(position.marketPubkey);
                return (
                  <PositionCard
                    key={position.publicKey}
                    position={position}
                    market={market}
                    isPending={pendingAction === `fc:${position.publicKey}`}
                    onForceClose={() => handleForceClose(position)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PositionCard({
  position,
  market,
  isPending,
  onForceClose,
}: {
  position: PositionRow;
  market: MarketRow | undefined;
  isPending: boolean;
  onForceClose: () => void;
}) {
  const phase = market
    ? marketPhase(market.resolutionTimestamp, market.marketStatus)
    : "open";
  const isLastCall = phase === "last-call";
  const isSettled = phase === "settled";

  const safetyPct = safetyScore(position.healthFactor);
  const tone = safetyTone(position.healthFactor);
  const meterTone: "leaf" | "crimson" | "amber" =
    tone === "mint" ? "leaf" : tone === "alarm" ? "crimson" : "amber";
  const hasDebt = position.borrowShares > 0n;
  const canForceClose = isLastCall && hasDebt && position.healthFactor < 1.0;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-white transition-colors",
        isLastCall ? "border-crimson/40" : "border-border",
        isSettled && "opacity-80"
      )}
    >
      <div className="p-5 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5 lg:gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge variant={isLastCall ? "crimson" : "outline"}>
                {market?.collateralSymbol ?? position.collateralSymbol}
              </Badge>
              {market && (
                <Badge variant={
                  phase === "last-call" ? "crimson"
                  : phase === "narrowing" ? "amber"
                  : phase === "settled" ? "outline"
                  : "leaf"
                }>
                  {phase === "last-call" ? "Last call"
                    : phase === "settled" ? "Settled"
                    : phase === "narrowing" ? "Narrowing"
                    : "Open"}
                </Badge>
              )}
              {market && market.resolutionTimestamp > 0 && !isSettled && (
                <span className="text-[11px] font-bold text-ink3 uppercase tracking-wider numerals">
                  {formatDuration(market.resolutionTimestamp - Math.floor(Date.now() / 1000))}
                </span>
              )}
            </div>
            <Link
              href={`/markets/${position.marketPubkey}`}
              className="block line-clamp-2 text-[20px] font-extrabold leading-tight text-ink transition-colors hover:text-coral md:text-[24px]"
            >
              {market?.name ?? `${position.collateralSymbol} / ${position.loanSymbol}`}
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-5 lg:gap-7 text-[13px]">
            <Col label="Collateral" value={position.collateralAmount > 0n ? formatTokenAmount(position.collateralAmount, position.collateralDecimals, 3) : "—"} sub={position.collateralValueUsd > 0 ? formatUSD(position.collateralValueUsd) : undefined} />
            <Col label="Lent" value={position.supplyAssetsUsd > 0 ? formatUSD(position.supplyAssetsUsd) : "—"} accent="leaf" />
            <Col label="Borrowed" value={position.borrowAssetsUsd > 0 ? formatUSD(position.borrowAssetsUsd) : "—"} accent="coral" />
          </div>

          {hasDebt ? (
            <div className="w-full lg:w-56">
              <div className="flex items-baseline justify-between mb-2">
                <span className="eyebrow-xs">Safety</span>
                <span className={cn(
                  "text-[11px] font-bold uppercase tracking-wider",
                  tone === "mint" && "text-leaf",
                  tone === "signal" && "text-amber-deep",
                  tone === "alarm" && "text-crimson"
                )}>
                  {safetyLabel(position.healthFactor)}
                </span>
              </div>
              <Meter value={safetyPct} tone={meterTone} />
            </div>
          ) : (
            <div className="w-full lg:w-56 text-right">
              <div className="eyebrow-xs">Safety</div>
              <div className="mt-1 text-[13px] text-ink3">No debt</div>
            </div>
          )}
        </div>

        {canForceClose && (
          <div className="mt-5 pt-5 border-t border-crimson/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-[13px] text-crimson font-bold">
              Unsafe during last call. Force-close is available.
            </p>
            <Button variant="alarm" size="md" loading={isPending} onClick={onForceClose}>
              Force close
            </Button>
          </div>
        )}

        {!canForceClose && isLastCall && hasDebt && (
          <div className="mt-5 pt-5 border-t border-border flex items-center justify-between gap-3">
            <p className="text-[13px] text-ink2 font-medium">
              Safe during last call.
            </p>
            <Link href={`/markets/${position.marketPubkey}?tab=borrow`}>
              <Button variant="secondary" size="sm">Repay</Button>
            </Link>
          </div>
        )}

        {!isLastCall && (
          <div className="mt-5 pt-5 border-t border-border flex items-center justify-end gap-2 flex-wrap">
            <Link href={`/markets/${position.marketPubkey}?tab=borrow`}>
              <Button variant="ghost" size="sm">Borrow more</Button>
            </Link>
            <Link href={`/markets/${position.marketPubkey}?tab=borrow`}>
              <Button variant="secondary" size="sm">Repay</Button>
            </Link>
            <Link href={`/markets/${position.marketPubkey}?tab=collateral`}>
              <Button variant="primary" size="sm">Manage collateral</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Col({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "leaf" | "coral" }) {
  const c = accent === "leaf" ? "text-leaf" : accent === "coral" ? "text-coral" : "text-ink";
  return (
    <div>
      <div className="eyebrow-xs mb-1">{label}</div>
      <div className={cn("numerals text-[16px] font-extrabold", c)}>{value}</div>
      {sub && <div className="text-[11px] text-ink3 mt-0.5 numerals font-bold">{sub}</div>}
    </div>
  );
}
