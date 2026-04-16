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
    "ForUjmX3VzE5EsRfzktF529LToK7vyzx6czH5o1dUTY8"
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
const SEED_STATIC_ORACLE = Buffer.from("static_oracle");

export const SCRIPTS_DIR = __dirname;
export const DEMO_MINTS_PATH = path.join(SCRIPTS_DIR, "demo-mints.json");
export const DEMO_DEPLOYMENT_PATH = path.join(
  SCRIPTS_DIR,
  "demo-deployment.json"
);
export const DEMO_WALLETS_PATH = path.join(SCRIPTS_DIR, "demo-wallets.json");
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
  collateralSymbol: string;
  collateralName: string;
  collateralIcon: string;
  collateralDecimals: number;
  collateralPriceUsd: number;
  loanSymbol: string;
  loanName: string;
  loanIcon: string;
  loanDecimals: number;
  loanPriceUsd: number;
  lltvBps: bigint;
  irmNonce: bigint;
  baseRatePct: number;
  slope1Pct: number;
  slope2Pct: number;
  kinkPct: number;
  feeBps: bigint;
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
  market: string;
  marketId: string;
  collateralMint: string;
  loanMint: string;
  irm: string;
  collateralOracle: string;
  loanOracle: string;
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
  collateralPriceUsd: number;
  loanPriceUsd: number;
  lltv: number;
  feeBps: number;
}

export interface DemoDeploymentFile {
  cluster: DemoCluster;
  generatedAt: string;
  programId: string;
  markets: Record<string, DemoDeploymentEntry>;
}

export interface DemoWalletsFile {
  primaryWallet: string;
  liquidationTarget: string;
  liquidationTargetSecretKey?: number[];
  supportingWallets?: Record<string, number[]>;
}

export const DEMO_MARKETS: DemoMarketDefinition[] = [
  {
    key: "wsol-usdc",
    name: "wSOL / USDC",
    collateralSymbol: "wSOL",
    collateralName: "Wrapped SOL",
    collateralIcon: "◎",
    collateralDecimals: 9,
    collateralPriceUsd: 165,
    loanSymbol: "USDC",
    loanName: "USD Coin",
    loanIcon: "$",
    loanDecimals: 6,
    loanPriceUsd: 1,
    lltvBps: 8600n,
    irmNonce: 0n,
    baseRatePct: 0,
    slope1Pct: 5,
    slope2Pct: 230,
    kinkPct: 80,
    feeBps: 0n,
    collateralFeedId: Buffer.from([1, ...new Array(31).fill(0)]),
    loanFeedId: Buffer.alloc(32),
  },
  {
    key: "jitosol-usdc",
    name: "JitoSOL / USDC",
    collateralSymbol: "jitoSOL",
    collateralName: "Jito Staked SOL",
    collateralIcon: "⚡",
    collateralDecimals: 9,
    collateralPriceUsd: 180,
    loanSymbol: "USDC",
    loanName: "USD Coin",
    loanIcon: "$",
    loanDecimals: 6,
    loanPriceUsd: 1,
    lltvBps: 8000n,
    irmNonce: 1n,
    baseRatePct: 0,
    slope1Pct: 4,
    slope2Pct: 200,
    kinkPct: 80,
    feeBps: 0n,
    collateralFeedId: Buffer.from([2, ...new Array(31).fill(0)]),
    loanFeedId: Buffer.alloc(32),
  },
  {
    key: "jup-usdc",
    name: "JUP / USDC",
    collateralSymbol: "JUP",
    collateralName: "Jupiter",
    collateralIcon: "♃",
    collateralDecimals: 6,
    collateralPriceUsd: 0.8,
    loanSymbol: "USDC",
    loanName: "USD Coin",
    loanIcon: "$",
    loanDecimals: 6,
    loanPriceUsd: 1,
    lltvBps: 7000n,
    irmNonce: 2n,
    baseRatePct: 0,
    slope1Pct: 8,
    slope2Pct: 300,
    kinkPct: 75,
    feeBps: 0n,
    collateralFeedId: Buffer.from([3, ...new Array(31).fill(0)]),
    loanFeedId: Buffer.alloc(32),
  },
];

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

export function deriveStaticOracle(
  feedId: Buffer,
  programId = PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_STATIC_ORACLE, feedId],
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

export function priceToWad(priceUsd: number, decimals: number): bigint {
  return BigInt(Math.floor((priceUsd * Number(WAD)) / 10 ** decimals));
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
  primaryWallet?: string;
  liquidationTarget?: string;
  tokens: Record<
    string,
    {
      symbol: string;
      name: string;
      icon: string;
      decimals: number;
      oracleFeedId?: string;
    }
  >;
  markets: Record<
    string,
    {
      name: string;
      marketId: string;
      collateralMint: string;
      loanMint: string;
      collateralSymbol: string;
      loanSymbol: string;
      oracle: string;
      lltv: number;
      feeBps: number;
      irm: string;
      collateralOracleFeedId?: string;
      loanOracleFeedId?: string;
      collateralOracle: string;
      loanOracle: string;
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
