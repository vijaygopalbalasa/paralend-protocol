// scripts/devnet-common.ts — shared helpers for the Paralend devnet pipeline
//
// Surfaces:
//   - PDA derivation helpers (paralend-era seeds only).
//   - devnet deployment / wallet / frontend config schemas.
//   - devnet-deployment.json / devnet-mints.json / devnet-wallets.json schemas.

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { keccak_256 } from "@noble/hashes/sha3";
import type { Paralend } from "../target/types/paralend";
import IDL from "../target/idl/paralend.json";
import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export type DevnetCluster = "devnet" | "localnet";

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
export const DEVNET_MINTS_PATH = path.join(SCRIPTS_DIR, "devnet-mints.json");
export const DEVNET_DEPLOYMENT_PATH = path.join(
  SCRIPTS_DIR,
  "devnet-deployment.json"
);
export const DEVNET_WALLETS_PATH = path.join(
  SCRIPTS_DIR,
  "devnet-wallets.json"
);
export const DEVNET_ATTESTER_PATH = path.join(
  SCRIPTS_DIR,
  "devnet-attester.json"
);
export const APP_MARKET_REGISTRY_PATH = path.join(
  __dirname,
  "..",
  "app",
  "src",
  "lib",
  "market-registry.json"
);

export interface DevnetMarketDefinition {
  key: string;
  name: string;
  kalshiTicker: string;
  /** DFlow/Kalshi outcome mint used as source metadata. Devnet uses a local outcome mint. */
  sourceCollateralMint?: string;
  sourceMarketLedger?: string;
  sourceSettlementMint?: string;
  /** Seconds from script-start until this market resolves. */
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
   * Deterministic feed ID derived from the live DFlow market identity, so
   * reruns with different tickers cannot collide.
   */
  collateralFeedId: Buffer;
  loanFeedId: Buffer;
}

export interface DevnetMintsFile {
  usdc: string;
  collateral: Record<string, string>;
}

export interface DevnetDeploymentEntry {
  key: string;
  name: string;
  kalshiTicker: string;
  resolutionTimestamp: number;
  market: string;
  marketId: string;
  collateralMint: string;
  sourceCollateralMint?: string;
  sourceMarketLedger?: string;
  sourceSettlementMint?: string;
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

export interface DevnetDeploymentFile {
  cluster: DevnetCluster;
  generatedAt: string;
  programId: string;
  attester: string;
  markets: Record<string, DevnetDeploymentEntry>;
}

export interface DevnetWalletsFile {
  primaryWallet: string;
  borrowerWallet?: string;
  borrowerSecretKey?: number[];
  liquidationTarget?: string;
  liquidationTargetSecretKey?: number[];
  supportingWallets?: Record<string, number[]>;
}

export interface DevnetAttesterFile {
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
 * Anchor point for resolution timestamps. Scripts use this as their base when
 * using live DFlow close times for devnet markets.
 */
export const REFERENCE_NOW_SECONDS = Math.floor(Date.now() / 1000);

export function parseClusterArg(argv = process.argv.slice(2)): DevnetCluster {
  const clusterArg = argv.find((arg) => arg.startsWith("--cluster="));
  const cluster = clusterArg?.split("=")[1] ?? "devnet";
  return cluster === "localnet" ? "localnet" : "devnet";
}

export function getRpcUrl(cluster: DevnetCluster): string {
  return cluster === "localnet"
    ? process.env.LOCALNET_RPC_URL ?? "http://127.0.0.1:8899"
    : process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
}

export function loadWalletKeypair(): Keypair {
  const home = process.env.HOME ?? "~";
  const cliConfigPath = path.join(
    home,
    ".config",
    "solana",
    "cli",
    "config.yml"
  );
  let cliKeypairPath: string | undefined;
  if (fs.existsSync(cliConfigPath)) {
    const config = fs.readFileSync(cliConfigPath, "utf-8");
    cliKeypairPath = config
      .split("\n")
      .find((line) => line.trim().startsWith("keypair_path:"))
      ?.split("keypair_path:")[1]
      ?.trim()
      ?.replace(/^['"]|['"]$/g, "");
  }

  const walletPath =
    process.env.PARALEND_WALLET ??
    process.env.SOLANA_KEYPAIR ??
    cliKeypairPath ??
    process.env.ANCHOR_WALLET ??
    path.join(home, ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
}

export function makeProvider(cluster: DevnetCluster) {
  const walletKeypair = loadWalletKeypair();
  return makeProviderWithKeypair(cluster, walletKeypair);
}

export function makeProviderWithKeypair(
  cluster: DevnetCluster,
  walletKeypair: Keypair
) {
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

export function makeReadOnlyProvider(cluster: DevnetCluster) {
  const wallet = new anchor.Wallet(Keypair.generate());
  const connection = new Connection(getRpcUrl(cluster), "confirmed");
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  return {
    provider,
    connection,
    wallet,
  };
}

export function makeProgram(provider: AnchorProvider): Program<Paralend> {
  const idl = {
    ...(IDL as Record<string, unknown>),
    address: PROGRAM_ID.toBase58(),
  };
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

export function deriveMarket(
  marketId: Buffer,
  programId = PROGRAM_ID
): PublicKey {
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

export function irmParams(definition: DevnetMarketDefinition) {
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

export function boundedOraclePrice(params: {
  livePriceWad: bigint;
  lastSpotWad: bigint;
  emaPriceWad: bigint;
  maxDeviationBps?: bigint;
}): bigint {
  const maxDeviationBps = params.maxDeviationBps ?? 500n;
  const anchors = [params.lastSpotWad, params.emaPriceWad].filter(
    (value) => value > 0n
  );
  if (anchors.length === 0) return params.livePriceWad;

  let lower = 0n;
  let upper = 2n ** 127n;
  for (const anchor of anchors) {
    const band = (anchor * maxDeviationBps) / BPS;
    const anchorLower = anchor > band ? anchor - band : 1n;
    const anchorUpper = anchor + band;
    if (anchorLower > lower) lower = anchorLower;
    if (anchorUpper < upper) upper = anchorUpper;
  }

  if (params.livePriceWad < lower) return lower;
  if (params.livePriceWad > upper) return upper;
  return params.livePriceWad;
}

/**
 * Pack a ticker string into a 48-byte zero-padded array suitable for
 * `create_market(kalshi_ticker)`.
 */
export function packTicker(ticker: string): Buffer {
  const out = Buffer.alloc(48);
  Buffer.from(ticker, "utf-8").copy(
    out,
    0,
    0,
    Math.min(48, Buffer.byteLength(ticker, "utf-8"))
  );
  return out;
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

export function writeJsonFile(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function defaultMarketRegistry(): {
  cluster: DevnetCluster;
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
      sourceMint?: string;
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
      sourceCollateralMint?: string;
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
