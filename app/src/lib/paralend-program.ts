import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3";

import IDL from "./paralend-idl.json";
import type { Paralend } from "./paralend-idl-types";
import {
  BPS,
  PROGRAM_ID,
  RPC_ENDPOINT,
  SECONDS_PER_YEAR,
  VIRTUAL_ASSETS,
  VIRTUAL_SHARES,
  WAD,
} from "./constants";

export interface AnchorWalletLike {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction>(txs: T[]) => Promise<T[]>;
}

export interface WalletAdapterLike {
  publicKey: PublicKey | null;
  signTransaction?: <T extends Transaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction>(txs: T[]) => Promise<T[]>;
}

export interface MarketAccountLike {
  collateralMint: PublicKey;
  loanMint: PublicKey;
  collateralOracleFeedId: number[] | Buffer;
  loanOracleFeedId: number[] | Buffer;
  irm: PublicKey;
  lltv: { toString(): string } | bigint | number;
}

const SEED_PREFIX = Buffer.from("paralend");
const SEED_PROTOCOL = Buffer.from("protocol_state");
const SEED_MARKET = Buffer.from("market");
const SEED_POSITION = Buffer.from("position");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_PRICE_CACHE = Buffer.from("price_cache");

export function getProgramId(): PublicKey {
  return new PublicKey(PROGRAM_ID);
}

function withProgramAddress(programId: PublicKey) {
  return {
    ...(IDL as Record<string, unknown>),
    address: programId.toBase58(),
  };
}

function makeReadonlyWallet(): AnchorWalletLike {
  const publicKey = SystemProgram.programId;
  return {
    publicKey,
    signTransaction: async <T extends Transaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction>(txs: T[]) => txs,
  };
}

export function makeAnchorProvider(
  connection: Connection,
  wallet: AnchorWalletLike
): AnchorProvider {
  const providerWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions:
      wallet.signAllTransactions ??
      (async <T extends Transaction>(txs: T[]) =>
        Promise.all(txs.map((tx) => wallet.signTransaction(tx)))),
  };

  return new AnchorProvider(connection, providerWallet as any, {
    commitment: "confirmed",
  });
}

export function toAnchorWallet(
  wallet: WalletAdapterLike
): AnchorWalletLike | null {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return null;
  }

  return {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions: wallet.signAllTransactions,
  };
}

export function makeProgram(
  connection: Connection,
  wallet?: AnchorWalletLike,
  programId: PublicKey = getProgramId()
): Program<Paralend> {
  const provider = makeAnchorProvider(connection, wallet ?? makeReadonlyWallet());
  return new Program<Paralend>(withProgramAddress(programId) as any, provider);
}

export function makeReadonlyProgram(
  connection = new Connection(RPC_ENDPOINT, "confirmed"),
  programId: PublicKey = getProgramId()
) {
  return makeProgram(connection, undefined, programId);
}

export function bnToBigInt(value: { toString(): string } | bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  return BigInt(value.toString());
}

export function bigIntToBN(value: bigint): BN {
  return new BN(value.toString());
}

export function computeMarketId(params: {
  collateralMint: PublicKey;
  loanMint: PublicKey;
  collateralOracleFeedId: Buffer;
  loanOracleFeedId: Buffer;
  irm: PublicKey;
  lltv: bigint;
}): Buffer {
  const lltvBuf = Buffer.alloc(8);
  lltvBuf.writeBigUInt64LE(params.lltv);

  return Buffer.from(
    keccak_256(
      Buffer.concat([
        params.collateralMint.toBuffer(),
        params.loanMint.toBuffer(),
        params.collateralOracleFeedId,
        params.loanOracleFeedId,
        params.irm.toBuffer(),
        lltvBuf,
      ])
    )
  );
}

export function computeMarketIdFromAccount(account: MarketAccountLike): Buffer {
  return computeMarketId({
    collateralMint: account.collateralMint,
    loanMint: account.loanMint,
    collateralOracleFeedId: Buffer.from(account.collateralOracleFeedId),
    loanOracleFeedId: Buffer.from(account.loanOracleFeedId),
    irm: account.irm,
    lltv: bnToBigInt(account.lltv),
  });
}

export function deriveProtocolStatePDA(programId = getProgramId()): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PROTOCOL],
    programId
  )[0];
}

export function deriveMarketPDA(marketId: Buffer, programId = getProgramId()): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_MARKET, marketId],
    programId
  )[0];
}

export function derivePositionPDA(
  marketId: Buffer,
  owner: PublicKey,
  programId = getProgramId()
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_POSITION, marketId, owner.toBuffer()],
    programId
  )[0];
}

export function deriveLoanVaultPDA(
  marketId: Buffer,
  programId = getProgramId()
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LOAN_VAULT, marketId],
    programId
  )[0];
}

export function deriveCollateralVaultPDA(
  marketId: Buffer,
  programId = getProgramId()
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_COLLATERAL_VAULT, marketId],
    programId
  )[0];
}

export function derivePriceCachePDA(
  marketId: Buffer,
  programId = getProgramId()
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PRICE_CACHE, marketId],
    programId
  )[0];
}

export function ensureAtaIx(
  mint: PublicKey,
  owner: PublicKey,
  payer: PublicKey
): { address: PublicKey; instruction: TransactionInstruction } {
  const address = getAssociatedTokenAddressSync(mint, owner);
  return {
    address,
    instruction: createAssociatedTokenAccountIdempotentInstruction(
      payer,
      address,
      owner,
      mint
    ),
  };
}

export async function getTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) return 0n;

  const balance = await connection.getTokenAccountBalance(ata, "confirmed");
  return BigInt(balance.value.amount);
}

export function irmBorrowRatePerSecond(
  utilization: bigint,
  baseRate: bigint,
  slope1: bigint,
  slope2: bigint,
  kink: bigint
): bigint {
  if (utilization <= kink) {
    return baseRate + (slope1 * utilization) / WAD;
  }
  const below = (slope1 * kink) / WAD;
  const above = (slope2 * (utilization - kink)) / WAD;
  return baseRate + below + above;
}

export function calculateUtilization(
  totalBorrowAssets: bigint,
  totalSupplyAssets: bigint
): bigint {
  if (totalSupplyAssets === 0n) return 0n;
  return (totalBorrowAssets * WAD) / totalSupplyAssets;
}

export function annualizedPercent(ratePerSecond: bigint): number {
  return (Number(ratePerSecond) * Number(SECONDS_PER_YEAR) * 100) / Number(WAD);
}

export function toAssetsDown(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = totalShares + VIRTUAL_SHARES;
  return num / den;
}

export function toAssetsUp(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = totalShares + VIRTUAL_SHARES;
  return (num + den - 1n) / den;
}

export function toSharesDown(
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = assets * (totalShares + VIRTUAL_SHARES);
  const den = totalAssets + VIRTUAL_ASSETS;
  return num / den;
}

export function calculateHealthFactor(params: {
  collateral: bigint;
  borrowShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lltv: bigint;
  collateralPriceWad: bigint;
  loanPriceWad: bigint;
}): number {
  const {
    collateral,
    borrowShares,
    totalBorrowAssets,
    totalBorrowShares,
    lltv,
    collateralPriceWad,
    loanPriceWad,
  } = params;
  if (borrowShares === 0n) return Infinity;

  const borrowAssets = toAssetsUp(
    borrowShares,
    totalBorrowAssets,
    totalBorrowShares
  );
  if (borrowAssets === 0n) return Infinity;

  const collateralUsd = (collateral * collateralPriceWad) / WAD;
  const debtUsd = (borrowAssets * loanPriceWad + WAD - 1n) / WAD;

  if (debtUsd === 0n) return Infinity;
  return Number(collateralUsd * lltv) / Number(debtUsd * BPS);
}

export function parseTokenAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
}

export function parseHex32(value: string): Buffer | null {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    return null;
  }
  return Buffer.from(normalized, "hex");
}

export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 4
): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n || maxFractionDigits === 0) {
    return whole.toString();
  }

  const raw = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  return raw ? `${whole.toString()}.${raw}` : whole.toString();
}

export function shortAddressLabel(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function tokenUsdValue(amount: bigint, decimals: number, priceWad: bigint): number {
  return (
    Number((amount * priceWad) / WAD) / Number(10n ** BigInt(Math.max(0, 18 - decimals)))
  );
}
