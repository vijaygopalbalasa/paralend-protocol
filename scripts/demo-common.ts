// scripts/demo-common.ts — shared helpers for the Paralend demo pipeline
//
// Surfaces:
//   - DEMO_MARKETS: 3 Kalshi-style prediction markets with resolution
//     timestamps (anchored to `REFERENCE_NOW` so reruns of setup produce
//     deterministic expiries relative to script launch).
//   - PDA derivation helpers (paralend-era seeds only).
//   - demo-deployment.json / demo-mints.json / demo-wallets.json schemas.

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { keccak_256 } from "@noble/hashes/sha3";
import type { Paralend } from "../target/types/paralend";
import IDL from "../target/idl/paralend.json";
import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export type DemoCluster = "devnet" | "localnet";

export const PROGRAM_ID = new PublicKey(
  process.env.PARALEND_PROGRAM_ID ??
    "2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8"
);

export const WAD = 1_000_000_000_000_000_000n;
export const BPS = 10_000n;
export const SECONDS_PER_YEAR = 31_536_000n;

const SEED_PREFIX = Buffer.from("paralend");
const SEED_PROTOCOL = Buffer.from("protocol_state");
const SEED_MARKET = Buffer.from("market");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_POSITION = Buffer.from("position");
const SEED_LINEAR_IRM = Buffer.from("linear_irm");
const SEED_PRICE_CACHE = Buffer.from("price_cache");

export const SCRIPTS_DIR = __dirname;
export const DEMO_MINTS_PATH = path.join(SCRIPTS_DIR, "demo-mints.json");
export const DEMO_DEPLOYMENT_PATH = path.join(
  SCRIPTS_DIR,
  "demo-deployment.json"
);
export const DEMO_WALLETS_PATH = path.join(SCRIPTS_DIR, "demo-wallets.json");
export const DEMO_ATTESTER_PATH = path.join(SCRIPTS_DIR, "demo-attester.json");
export const APP_DEMO_CONFIG_PATH = path.join(
  __dirname,
  "..",
  "app",
  "src",
  "lib",
  "demo-config.json"
);

export interface DemoMarketDefinition {
  key: string;
  name: string;
  kalshiTicker: string;
  /**
   * Seconds from script-start until this market resolves. Must be > 7 days
   * for at least one market so the decay curve has runway to visualise.
   */
  resolutionInSeconds: number;
  /** Display symbol for the collateral ("YES" / "NO" side of the bet). */
  collateralSymbol: string;
  collateralName: string;
  collateralIcon: string;
  collateralDecimals: number;
  /** Initial YES/NO spot price (0..1) at seeding time. */
  initialPriceUsd: number;
  loanSymbol: string;
  loanName: string;
  loanIcon: string;
  loanDecimals: number;
  lltvBps: bigint;
  irmNonce: bigint;
  baseRatePct: number;
  slope1Pct: number;
  slope2Pct: number;
  kinkPct: number;
  feeBps: bigint;
  /**
   * Deterministic feed ID — derived from the Kalshi ticker at demo-setup
   * time rather than hardcoded so reruns with different tickers don't
   * collide. Populated by `resolveFeedId()`.
   */
  collateralFeedId: Buffer;
  loanFeedId: Buffer;
}

export interface DemoMintsFile {
  usdc: string;
  collateral: Record<string, string>;
}

export interface DemoDeploymentEntry {
  key: string;
  name: string;
  kalshiTicker: string;
  resolutionTimestamp: number;
  market: string;
  marketId: string;
  collateralMint: string;
  loanMint: string;
  irm: string;
  priceCache: string;
  collateralOracleFeedId: string;
  loanOracleFeedId: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralName: string;
  loanName: string;
  collateralIcon: string;
  loanIcon: string;
  collateralDecimals: number;
  loanDecimals: number;
  initialPriceUsd: number;
  lltv: number;
  feeBps: number;
  attester: string;
}

export interface DemoDeploymentFile {
  cluster: DemoCluster;
  generatedAt: string;
  programId: string;
  attester: string;
  markets: Record<string, DemoDeploymentEntry>;
}

export interface DemoWalletsFile {
  primaryWallet: string;
  borrowerWallet?: string;
  borrowerSecretKey?: number[];
  liquidationTarget?: string;
  liquidationTargetSecretKey?: number[];
  supportingWallets?: Record<string, number[]>;
}

export interface DemoAttesterFile {
  pubkey: string;
  secretKey: number[];
}

/**
 * Deterministic feed_id derived from the Kalshi ticker. Thirty-two bytes
 * of `keccak256(ticker)`. Both `create_market` and `register_price_cache`
 * use this same value.
 */
export function resolveFeedId(ticker: string): Buffer {
  return Buffer.from(keccak_256(Buffer.from(ticker, "utf-8")));
}

export const ZERO_FEED_ID = Buffer.alloc(32);

/**
 * Anchor point for resolution timestamps. Scripts that want deterministic
 * resolution dates across reruns should use this as their base.
 */
export const REFERENCE_NOW_SECONDS = Math.floor(Date.now() / 1000);

/**
 * 3 flagship Kalshi-style prediction markets used for the demo. Each
 * resolves at a different distance so the UI shows the full spectrum:
 *   - BTC-150K-JUN2026  → 45 days   (active, no decay yet)
 *   - SOL-300-DEC2026   → 8 days    (just entering decay band)
 *   - NFL-FINAL-24H     → 18 hours  (inside the force-close window in < 16h)
 */
export const DEMO_MARKETS: DemoMarketDefinition[] = (() => {
  const defs: Array<Omit<DemoMarketDefinition, "collateralFeedId" | "loanFeedId">> = [
    {
      key: "btc-150k-jun2026",
      name: "BTC > $150k by Jun 2026",
      kalshiTicker: "BTC-150K-JUN2026",
      resolutionInSeconds: 45 * 24 * 3600,
      collateralSymbol: "YES",
      collateralName: "BTC ≥ $150k YES",
      collateralIcon: "🟢",
      collateralDecimals: 6,
      initialPriceUsd: 0.38,
      loanSymbol: "USDC",
      loanName: "USD Coin (devnet)",
      loanIcon: "$",
      loanDecimals: 6,
      lltvBps: 6000n,
      irmNonce: 0n,
      baseRatePct: 0,
      slope1Pct: 4,
      slope2Pct: 200,
      kinkPct: 80,
      feeBps: 0n,
    },
    {
      key: "sol-300-dec2026",
      name: "SOL > $300 by Dec 2026",
      kalshiTicker: "SOL-300-DEC2026",
      resolutionInSeconds: 8 * 24 * 3600,
      collateralSymbol: "YES",
      collateralName: "SOL ≥ $300 YES",
      collateralIcon: "🟣",
      collateralDecimals: 6,
      initialPriceUsd: 0.52,
      loanSymbol: "USDC",
      loanName: "USD Coin (devnet)",
      loanIcon: "$",
      loanDecimals: 6,
      lltvBps: 6000n,
      irmNonce: 1n,
      baseRatePct: 0,
      slope1Pct: 5,
      slope2Pct: 230,
      kinkPct: 80,
      feeBps: 0n,
    },
    {
      key: "nfl-final-24h",
      name: "NFL Final (demo — 18h)",
      kalshiTicker: "NFL-FINAL-24H",
      resolutionInSeconds: 18 * 3600,
      collateralSymbol: "YES",
      collateralName: "NFL Final YES",
      collateralIcon: "🏈",
      collateralDecimals: 6,
      initialPriceUsd: 0.61,
      loanSymbol: "USDC",
      loanName: "USD Coin (devnet)",
      loanIcon: "$",
      loanDecimals: 6,
      lltvBps: 5500n,
      irmNonce: 2n,
      baseRatePct: 0,
      slope1Pct: 6,
      slope2Pct: 300,
      kinkPct: 75,
      feeBps: 0n,
    },
  ];

  return defs.map((d) => ({
    ...d,
    collateralFeedId: resolveFeedId(d.kalshiTicker),
    loanFeedId: ZERO_FEED_ID,
  }));
})();

export function parseClusterArg(argv = process.argv.slice(2)): DemoCluster {
  const clusterArg = argv.find((arg) => arg.startsWith("--cluster="));
  const cluster = clusterArg?.split("=")[1] ?? "devnet";
  return cluster === "localnet" ? "localnet" : "devnet";
}

export function getRpcUrl(cluster: DemoCluster): string {
  return cluster === "localnet"
    ? "http://127.0.0.1:8899"
    : process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
}

export function loadWalletKeypair(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ??
    path.join(process.env.HOME ?? "~", ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
}

export function makeProvider(cluster: DemoCluster) {
  const walletKeypair = loadWalletKeypair();
  const wallet = new anchor.Wallet(walletKeypair);
  const connection = new Connection(getRpcUrl(cluster), "confirmed");
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  return {
    provider,
    connection,
    payer: walletKeypair,
    wallet,
  };
}

export function makeProgram(provider: AnchorProvider): Program<Paralend> {
  const idl = {
    ...(IDL as Record<string, unknown>),
    address: PROGRAM_ID.toBase58(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program<Paralend>(idl as any, provider);
}

export function deriveProtocolState(programId = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PROTOCOL],
    programId
  )[0];
}

export function deriveLinearIrm(
  admin: PublicKey,
  nonce: bigint,
  programId = PROGRAM_ID
): PublicKey {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LINEAR_IRM, admin.toBuffer(), nonceBuffer],
    programId
  )[0];
}

export function derivePriceCache(
  marketId: Buffer,
  programId = PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PRICE_CACHE, marketId],
    programId
  )[0];
}

export function deriveMarket(marketId: Buffer, programId = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_MARKET, marketId],
    programId
  )[0];
}

export function deriveLoanVault(
  marketId: Buffer,
  programId = PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LOAN_VAULT, marketId],
    programId
  )[0];
}

export function deriveCollateralVault(
  marketId: Buffer,
  programId = PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_COLLATERAL_VAULT, marketId],
    programId
  )[0];
}

export function derivePosition(
  marketId: Buffer,
  owner: PublicKey,
  programId = PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_POSITION, marketId, owner.toBuffer()],
    programId
  )[0];
}

export function computeMarketId(
  collateralMint: PublicKey,
  loanMint: PublicKey,
  collateralOracleFeedId: Buffer,
  loanOracleFeedId: Buffer,
  irm: PublicKey,
  lltv: bigint
): Buffer {
  const lltvBuffer = Buffer.alloc(8);
  lltvBuffer.writeBigUInt64LE(lltv);
  return Buffer.from(
    keccak_256(
      Buffer.concat([
        collateralMint.toBuffer(),
        loanMint.toBuffer(),
        collateralOracleFeedId,
        loanOracleFeedId,
        irm.toBuffer(),
        lltvBuffer,
      ])
    )
  );
}

export function irmParams(definition: DemoMarketDefinition) {
  return {
    baseRate:
      BigInt(Math.floor((definition.baseRatePct / 100) * Number(WAD))) /
      SECONDS_PER_YEAR,
    slope1:
      BigInt(Math.floor((definition.slope1Pct / 100) * Number(WAD))) /
      SECONDS_PER_YEAR,
    slope2:
      BigInt(Math.floor((definition.slope2Pct / 100) * Number(WAD))) /
      SECONDS_PER_YEAR,
    kink: BigInt(Math.floor((definition.kinkPct / 100) * Number(WAD))),
  };
}

/**
 * Convert a USD price (e.g. 0.42 for a YES token at 42¢) to WAD-scaled
 * price-per-base-unit. Since YES/NO tokens use 6 decimals, price_wad =
 * priceUsd * 1e18 / 1e6.
 */
export function priceToWad(priceUsd: number, decimals: number): bigint {
  // Scale the USD price to WAD first (keeps 18-digit precision) then
  // divide by the per-base-unit factor.
  const priceScaled = BigInt(Math.round(priceUsd * 1_000_000_000_000)); // 12-digit fixed
  const wadPerFull = (priceScaled * WAD) / 1_000_000_000_000n;
  return wadPerFull / 10n ** BigInt(decimals);
}

/**
 * Pack a ticker string into a 48-byte zero-padded array suitable for
 * `create_market(kalshi_ticker)`.
 */
export function packTicker(ticker: string): Buffer {
  const out = Buffer.alloc(48);
  Buffer.from(ticker, "utf-8").copy(out, 0, 0, Math.min(48, Buffer.byteLength(ticker, "utf-8")));
  return out;
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

export function writeJsonFile(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function defaultDemoConfig(): {
  cluster: DemoCluster;
  programId: string;
  generatedAt: string;
  attester?: string;
  primaryWallet?: string;
  liquidationTarget?: string;
  tokens: Record<
    string,
    {
      symbol: string;
      name: string;
      icon: string;
      decimals: number;
    }
  >;
  markets: Record<
    string,
    {
      name: string;
      kalshiTicker: string;
      resolutionTimestamp: number;
      marketId: string;
      collateralMint: string;
      loanMint: string;
      collateralSymbol: string;
      loanSymbol: string;
      oracle: string;
      lltv: number;
      feeBps: number;
      irm: string;
      priceCache: string;
      collateralOracleFeedId: string;
      loanOracleFeedId: string;
    }
  >;
} {
  return {
    cluster: "devnet",
    programId: PROGRAM_ID.toBase58(),
    generatedAt: new Date().toISOString(),
    tokens: {},
    markets: {},
  };
}
