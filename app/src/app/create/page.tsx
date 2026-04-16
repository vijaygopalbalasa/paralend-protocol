"use client";

import Link from "next/link";
import { BN } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMarkets } from "@/hooks/useMarkets";
import { DEMO_CONFIG } from "@/lib/demo-config";
import {
  computeMarketId,
  deriveCollateralVaultPDA,
  deriveLoanVaultPDA,
  deriveMarketPDA,
  deriveProtocolStatePDA,
  makeAnchorProvider,
  makeProgram,
  parseHex32,
  toAnchorWallet,
} from "@/lib/paralend-program";
import { LLTV_PRESETS, MAX_FEE_BPS } from "@/lib/constants";
import { cn, formatUSD } from "@/lib/utils";

type Notice =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatAddressPreview(value: string): string {
  return value ? `${value.slice(0, 8)}...` : "—";
}

export default function CreateMarketPage() {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { markets } = useMarkets(30_000);

  const seededMarkets = useMemo(() => Object.values(DEMO_CONFIG.markets), []);
  const demoTokens = useMemo(
    () => Object.entries(DEMO_CONFIG.tokens).map(([mint, token]) => ({ mint, ...token })),
    []
  );

  const defaultTemplate = seededMarkets[0];
  const [collateralMint, setCollateralMint] = useState(defaultTemplate?.collateralMint ?? "");
  const [loanMint, setLoanMint] = useState(defaultTemplate?.loanMint ?? "");
  const [collateralOracleFeedId, setCollateralOracleFeedId] = useState(
    defaultTemplate?.collateralOracleFeedId ?? ""
  );
  const [irmAddress, setIrmAddress] = useState(defaultTemplate?.irm ?? "");
  const [lltv, setLltv] = useState(defaultTemplate?.lltv ?? 80);
  const [feeBps, setFeeBps] = useState(0);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parsedCollateralFeed = parseHex32(collateralOracleFeedId);

  let marketIdHex = "";
  try {
    if (collateralMint && loanMint && irmAddress && parsedCollateralFeed) {
      marketIdHex = computeMarketId({
        collateralMint: new PublicKey(collateralMint),
        loanMint: new PublicKey(loanMint),
        collateralOracleFeedId: parsedCollateralFeed,
        loanOracleFeedId: Buffer.alloc(32),
        irm: new PublicKey(irmAddress),
        lltv: BigInt(lltv) * 100n,
      }).toString("hex");
    }
  } catch {
    marketIdHex = "";
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    try {
      new PublicKey(collateralMint);
    } catch {
      nextErrors.collateralMint = "Enter a valid collateral mint address.";
    }
    try {
      new PublicKey(loanMint);
    } catch {
      nextErrors.loanMint = "Enter a valid loan mint address.";
    }
    if (!parsedCollateralFeed) {
      nextErrors.collateralOracleFeedId = "Enter a 32-byte oracle feed id in hex.";
    }
    try {
      new PublicKey(irmAddress);
    } catch {
      nextErrors.irmAddress = "Enter a valid IRM address.";
    }
    if (collateralMint && loanMint && collateralMint === loanMint) {
      nextErrors.loanMint = "Collateral and loan mint must differ.";
    }
    if (lltv <= 0 || lltv >= 100) {
      nextErrors.lltv = "LLTV must be between 1% and 99%.";
    }
    if (feeBps < 0 || feeBps > MAX_FEE_BPS) {
      nextErrors.feeBps = `Fee must be between 0 and ${MAX_FEE_BPS} BPS.`;
    }
    return nextErrors;
  };

  const applyTemplate = (address: string) => {
    const template = DEMO_CONFIG.markets[address];
    if (!template) return;
    setCollateralMint(template.collateralMint);
    setLoanMint(template.loanMint);
    setCollateralOracleFeedId(template.collateralOracleFeedId ?? "");
    setIrmAddress(template.irm);
    setLltv(template.lltv);
    setFeeBps(0);
    setErrors({});
    setNotice(null);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const anchorWallet = toAnchorWallet(wallet);
    if (!anchorWallet || !parsedCollateralFeed) {
      setNotice({
        type: "error",
        message: "Connect a wallet that supports transaction signing.",
      });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const collateralMintPk = new PublicKey(collateralMint);
      const loanMintPk = new PublicKey(loanMint);
      const irmPk = new PublicKey(irmAddress);
      const marketId = computeMarketId({
        collateralMint: collateralMintPk,
        loanMint: loanMintPk,
        collateralOracleFeedId: parsedCollateralFeed,
        loanOracleFeedId: Buffer.alloc(32),
        irm: irmPk,
        lltv: BigInt(lltv) * 100n,
      });

      const marketAddress = deriveMarketPDA(marketId);
      const provider = makeAnchorProvider(connection, anchorWallet);
      const program = makeProgram(connection, anchorWallet);
      const methods = program.methods as any;

      const tx = new Transaction().add(
        await methods
          .createMarket(
            Array.from(marketId),
            Array.from(parsedCollateralFeed),
            Array.from(Buffer.alloc(32)),
            irmPk,
            new BN((BigInt(lltv) * 100n).toString()),
            new BN(BigInt(feeBps).toString())
          )
          .accountsPartial({
            payer: anchorWallet.publicKey,
            protocolState: deriveProtocolStatePDA(),
            collateralMint: collateralMintPk,
            loanMint: loanMintPk,
            irmAccount: irmPk,
            market: marketAddress,
            collateralVault: deriveCollateralVaultPDA(marketId),
            loanVault: deriveLoanVaultPDA(marketId),
          })
          .instruction()
      );

      const signature = await provider.sendAndConfirm(tx, []);
      setNotice({
        type: "success",
        message: `Market created: ${signature.slice(0, 12)}...`,
      });
      router.push(`/markets/${marketAddress.toBase58()}?tab=supply`);
    } catch (createError) {
      setNotice({ type: "error", message: getErrorMessage(createError) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-paralend-text-primary">Create a Market</h1>
        <p className="mt-1 text-sm text-paralend-text-secondary">
          One transaction. Deterministic market address. No listing committee.
        </p>
      </div>

      {notice && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            notice.type === "success"
              ? "border-paralend-green/30 bg-paralend-green/10 text-paralend-green"
              : "border-paralend-red/30 bg-paralend-red/10 text-paralend-red"
          )}
        >
          {notice.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-paralend-border bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-paralend-text-secondary mb-1">
            Estimated Cost
          </div>
          <div className="text-xl font-black text-paralend-text-primary">~0.01 SOL</div>
        </div>
        <div className="rounded-lg border border-paralend-border bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-paralend-text-secondary mb-1">
            Confirmation
          </div>
          <div className="text-xl font-black text-paralend-text-primary">~400ms</div>
        </div>
        <div className="rounded-lg border border-paralend-border bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-paralend-text-secondary mb-1">
            Protocol Fee
          </div>
          <div className="text-xl font-black text-paralend-text-primary">
            {(feeBps / 100).toFixed(2)}%
          </div>
        </div>
      </div>

      {seededMarkets.length > 0 && (
        <Card
          header={
            <CardHeader
              title="Seeded Templates"
              description="Quick-fill the exact devnet mints, IRM, and oracle feeds generated by the demo scripts."
            />
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {seededMarkets.map((market) => (
              <button
                key={market.marketId}
                type="button"
                onClick={() => applyTemplate(Object.keys(DEMO_CONFIG.markets).find((key) => DEMO_CONFIG.markets[key].marketId === market.marketId) ?? "")}
                className="rounded-xl border border-paralend-border bg-gray-50 p-4 text-left transition-colors hover:border-gray-400 hover:bg-white hover:shadow-sm"
              >
                <div className="text-sm font-bold text-paralend-text-primary tracking-tight">
                  {market.name}
                </div>
                <div className="mt-1 text-xs font-medium text-paralend-text-secondary">
                  LLTV {market.lltv}% · IRM {formatAddressPreview(market.irm)}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <form onSubmit={handleCreate} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card
            header={
              <CardHeader
                title="Token Pair"
                description="Choose the collateral token and the loan token."
              />
            }
          >
            <div className="flex flex-col gap-5">
              {demoTokens.length > 0 && (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-paralend-text-secondary">
                    Demo token shortcuts
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {demoTokens.map((token) => (
                      <button
                        key={token.mint}
                        type="button"
                        onClick={() => {
                          if (!collateralMint) {
                            setCollateralMint(token.mint);
                            if (token.oracleFeedId) {
                              setCollateralOracleFeedId(token.oracleFeedId);
                            }
                          } else {
                            setLoanMint(token.mint);
                          }
                        }}
                        className="rounded-lg border border-paralend-border bg-paralend-bg px-3 py-1.5 text-xs font-medium text-paralend-text-secondary transition-colors hover:border-paralend-primary/30 hover:text-paralend-text-primary"
                      >
                        {token.icon} {token.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Input
                label="Collateral Token Mint"
                placeholder="Mint address"
                value={collateralMint}
                onChange={(event) => setCollateralMint(event.target.value.trim())}
                error={errors.collateralMint}
                hint="Example: JUP, wSOL, BONK. The collateral oracle feed must match this mint."
              />

              <Input
                label="Loan Token Mint"
                placeholder="Mint address"
                value={loanMint}
                onChange={(event) => setLoanMint(event.target.value.trim())}
                error={errors.loanMint}
                hint="Loan oracle is fixed to all-zero feed id for the demo stablecoin path."
              />
            </div>
          </Card>

          <Card
            header={
              <CardHeader
                title="Oracle"
                description="For the current devnet demo the frontend uses seeded StaticOracle feed ids."
              />
            }
          >
            <div className="flex flex-col gap-5">
              <Input
                label="Collateral Oracle Feed ID"
                placeholder="32-byte hex, without or with 0x prefix"
                value={collateralOracleFeedId}
                onChange={(event) => setCollateralOracleFeedId(event.target.value.trim())}
                error={errors.collateralOracleFeedId}
                hint="The scripts generate these feed ids automatically and write them into the demo manifest."
              />
              <div className="rounded-lg border border-paralend-border bg-paralend-bg p-3 text-xs text-paralend-text-secondary">
                Loan oracle feed is fixed to <code className="font-mono">0x00..00</code>, which
                means the protocol prices the loan token at exactly $1 per token.
              </div>
            </div>
          </Card>

          <Card
            header={
              <CardHeader
                title="Risk Parameters"
                description="Pick the IRM, LLTV, and protocol fee."
              />
            }
          >
            <div className="flex flex-col gap-6">
              <Input
                label="Linear IRM Address"
                placeholder="IRM PDA address"
                value={irmAddress}
                onChange={(event) => setIrmAddress(event.target.value.trim())}
                error={errors.irmAddress}
                hint="Use one of the IRMs generated by setup-demo-markets.ts or paste any valid LinearIrm PDA."
              />

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-paralend-text-secondary">
                    LLTV
                  </label>
                  <span className="text-xl font-bold tabular-nums text-paralend-text-primary">
                    {lltv}%
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={1}
                  value={lltv}
                  onChange={(event) => setLltv(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-paralend-border"
                  style={{
                    background: `linear-gradient(to right, #000000 ${((lltv - 50) / 45) * 100}%, #E5E7EB ${((lltv - 50) / 45) * 100}%)`,
                  }}
                />
                <div className="mt-1 flex justify-between text-[10px] text-paralend-text-secondary">
                  <span>50%</span>
                  <span>95%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {LLTV_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setLltv(preset.lltv)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors",
                        lltv === preset.lltv
                          ? "border-paralend-primary bg-paralend-primary text-white shadow-sm"
                          : "border-paralend-border bg-gray-50 text-paralend-text-secondary hover:border-gray-400 hover:text-paralend-text-primary"
                      )}
                      title={preset.description}
                    >
                      {preset.label} — {preset.lltv}%
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label="Protocol Fee (BPS)"
                type="number"
                min={0}
                max={MAX_FEE_BPS}
                value={feeBps}
                onChange={(event) => setFeeBps(Number(event.target.value))}
                error={errors.feeBps}
                hint="Keep this at 0 for the bootstrap demo flow unless you want to explicitly show protocol take-rate."
                suffix="BPS"
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-paralend-border bg-paralend-card p-5">
            <div className="text-sm font-semibold text-paralend-text-primary">Market Summary</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Collateral", value: formatAddressPreview(collateralMint) },
                { label: "Loan", value: formatAddressPreview(loanMint) },
                { label: "Oracle Feed", value: formatAddressPreview(collateralOracleFeedId) },
                { label: "IRM", value: formatAddressPreview(irmAddress) },
                { label: "LLTV", value: `${lltv}%` },
                { label: "Fee", value: `${(feeBps / 100).toFixed(2)}%` },
              ].map((row) => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className="text-xs text-paralend-text-secondary">{row.label}</span>
                  <span className="font-mono text-xs font-medium text-paralend-text-primary">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-paralend-border pt-4 text-xs text-paralend-text-secondary">
              Deterministic market id
              <div className="mt-1 break-all font-mono text-[11px] text-paralend-text-primary">
                {marketIdHex || "Fill all fields to preview the market id"}
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} className="mt-5">
              Create Market
            </Button>
          </div>

          <Card
            header={
              <CardHeader
                title="Existing Markets"
                description="Use live markets as a reference or verify the newly created market after submission."
              />
            }
          >
            <div className="flex flex-col gap-3">
              {markets.length === 0 && (
                <div className="text-sm text-paralend-text-secondary">No markets found yet.</div>
              )}
              {markets.slice(0, 6).map((market) => (
                <Link
                  key={market.publicKey}
                  href={`/markets/${market.publicKey}`}
                  className="rounded-lg border border-paralend-border bg-paralend-bg p-3 transition-colors hover:border-paralend-primary/40"
                >
                  <div className="text-sm font-semibold text-paralend-text-primary">
                    {market.collateralSymbol} / {market.loanSymbol}
                  </div>
                  <div className="mt-1 text-xs text-paralend-text-secondary">
                    LLTV {market.lltv}% · TVL {formatUSD(market.tvlUsd)}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
}
