import { PublicKey } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  BPS,
  SECONDS_PER_YEAR,
  VIRTUAL_ASSETS,
  VIRTUAL_SHARES,
  WAD,
} from "./constants";
import type { MarketParams } from "./types";

// ─── Market ID ───────────────────────────────────────────────────────────────

/**
 * Compute the deterministic market ID.
 *
 * Mirrors the on-chain Rust:
 *   keccak256(collateral_mint ++ loan_mint ++ collateral_oracle_feed_id ++
 *             loan_oracle_feed_id ++ irm ++ lltv.to_le_bytes())
 *
 * Total input: 32+32+32+32+32+8 = 168 bytes → 32 byte digest.
 */
export function computeMarketId(params: MarketParams): Buffer {
  const buf = Buffer.alloc(168);
  let offset = 0;

  params.collateralMint.toBuffer().copy(buf, offset);
  offset += 32;

  params.loanMint.toBuffer().copy(buf, offset);
  offset += 32;

  params.collateralOracleFeedId.copy(buf, offset);
  offset += 32;

  params.loanOracleFeedId.copy(buf, offset);
  offset += 32;

  params.irm.toBuffer().copy(buf, offset);
  offset += 32;

  // lltv as 8-byte little-endian u64
  const lltvBuf = Buffer.alloc(8);
  const lltvLo = Number(params.lltv & BigInt(0xffffffff));
  const lltvHi = Number((params.lltv >> BigInt(32)) & BigInt(0xffffffff));
  lltvBuf.writeUInt32LE(lltvLo, 0);
  lltvBuf.writeUInt32LE(lltvHi, 4);
  lltvBuf.copy(buf, offset);

  return Buffer.from(keccak_256(buf));
}

// ─── Share / Asset Conversions ────────────────────────────────────────────────

/**
 * Convert assets → supply shares, rounding DOWN.
 * Used by: supply (lender deposits).
 * Rounding favors protocol — user gets fewer shares.
 *
 *   shares = assets * (totalShares + VIRTUAL_SHARES) / (totalAssets + VIRTUAL_ASSETS)
 */
export function toSharesDown(
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = assets * (totalShares + VIRTUAL_SHARES);
  const den = totalAssets + VIRTUAL_ASSETS;
  return num / den; // BigInt division truncates (= floor = round down)
}

/**
 * Convert assets → shares, rounding UP (ceiling division).
 * Used by: borrow (borrower takes debt), withdraw when specifying assets.
 */
export function toSharesUp(
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = assets * (totalShares + VIRTUAL_SHARES);
  const den = totalAssets + VIRTUAL_ASSETS;
  return (num + den - BigInt(1)) / den;
}

/**
 * Convert shares → assets, rounding DOWN.
 * Used by: withdraw (lender redeems), when specifying shares.
 *
 *   assets = shares * (totalAssets + VIRTUAL_ASSETS) / (totalShares + VIRTUAL_SHARES)
 */
export function toAssetsDown(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = totalShares + VIRTUAL_SHARES;
  return num / den;
}

/**
 * Convert shares → assets, rounding UP.
 * Used by: repay (borrower pays debt back).
 */
export function toAssetsUp(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = totalShares + VIRTUAL_SHARES;
  return (num + den - BigInt(1)) / den;
}

// ─── Rate / APY ──────────────────────────────────────────────────────────────

/**
 * Compute the borrow APY from the per-second WAD-scaled rate.
 *
 * Uses the linear approximation: APY ≈ ratePerSecond * SECONDS_PER_YEAR / WAD
 * (exact compound would be (1+r)^N - 1, but at these magnitudes the linear
 * approximation matches the on-chain Taylor compound to within a fraction of a
 * basis point and avoids floating-point overflow on extreme rates).
 *
 * Returns a decimal fraction (0.05 = 5%).
 */
export function calculateBorrowAPY(borrowRatePerSecond: bigint): number {
  // Multiply first in bigint to preserve precision, then convert to float
  const numerator = borrowRatePerSecond * SECONDS_PER_YEAR;
  return Number(numerator) / Number(WAD);
}

/**
 * Compute the net supply APY.
 *   supplyAPY = borrowAPY * (utilization / WAD) * (1 - feeBps / BPS)
 *
 * @param borrowRatePerSecond  WAD-scaled per-second borrow rate
 * @param utilization          WAD-scaled utilization ratio
 * @param feeBps               Protocol fee in basis points (e.g. 1000 = 10%)
 * Returns a decimal fraction (0.04 = 4%).
 */
export function calculateSupplyAPY(
  borrowRatePerSecond: bigint,
  utilization: bigint,
  feeBps: bigint
): number {
  const borrowApy = calculateBorrowAPY(borrowRatePerSecond);
  const utilizationFrac = Number(utilization) / Number(WAD);
  const feeMultiplier = 1 - Number(feeBps) / Number(BPS);
  return borrowApy * utilizationFrac * feeMultiplier;
}

/**
 * Compute utilization ratio, WAD-scaled.
 *   utilization = totalBorrowAssets * WAD / totalSupplyAssets
 *   Returns 0n if totalSupplyAssets == 0.
 */
export function calculateUtilization(
  totalBorrowAssets: bigint,
  totalSupplyAssets: bigint
): bigint {
  if (totalSupplyAssets === BigInt(0)) return BigInt(0);
  return (totalBorrowAssets * WAD) / totalSupplyAssets;
}

/**
 * Compute the health factor for a position.
 *
 * Mirrors the on-chain `is_position_healthy` logic:
 *   healthFactor = (collateralUsd * lltv) / (debtUsd * BPS)
 *
 * A position is healthy when healthFactor >= 1.0.
 * Returns Infinity when borrowShares == 0 (no debt).
 *
 * Price convention (same as on-chain): both prices are WAD-scaled USD per base
 * unit, i.e. the oracle already handles token decimals.
 *
 * @param collateral            Raw collateral base units
 * @param borrowShares          Borrower's share balance
 * @param totalBorrowAssets     Market total borrow assets
 * @param totalBorrowShares     Market total borrow shares
 * @param lltv                  Liquidation LTV in BPS (e.g. 8600n)
 * @param collateralPriceWad    WAD-scaled USD price per collateral base unit
 * @param loanPriceWad          WAD-scaled USD price per loan base unit
 */
export function calculateHealthFactor(
  collateral: bigint,
  borrowShares: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
  lltv: bigint,
  collateralPriceWad: bigint,
  loanPriceWad: bigint
): number {
  if (borrowShares === BigInt(0)) return Infinity;

  // Convert borrow shares → assets (round UP: worst-case debt)
  const borrowAssets = toAssetsUp(
    borrowShares,
    totalBorrowAssets,
    totalBorrowShares
  );

  if (borrowAssets === BigInt(0)) return Infinity;

  // USD values: price_wad is already per base unit, WAD cancels out
  const collateralUsd = (collateral * collateralPriceWad) / WAD;
  const loanUsd = (borrowAssets * loanPriceWad + WAD - BigInt(1)) / WAD; // ceil

  if (loanUsd === BigInt(0)) return Infinity;

  // healthFactor = (collateralUsd * lltv) / (loanUsd * BPS)
  const lhs = collateralUsd * lltv;
  const rhs = loanUsd * BPS;

  // Return as a float: 1.0 = at threshold
  return Number(lhs) / Number(rhs);
}

// ─── IRM Borrow Rate ─────────────────────────────────────────────────────────

/**
 * Compute the WAD-scaled per-second borrow rate for a linear kinked IRM.
 *
 * Below kink:  rate = baseRate + slope1 * utilization / WAD
 * Above kink:  rate = baseRate + slope1 * kink / WAD + slope2 * (util - kink) / WAD
 *
 * Mirrors `LinearIrm::borrow_rate_per_second` in Rust.
 */
export function irmBorrowRatePerSecond(
  utilization: bigint,
  baseRate: bigint,
  slope1: bigint,
  slope2: bigint,
  kink: bigint
): bigint {
  if (utilization <= kink) {
    // Below kink: base + slope1 * util / WAD
    return baseRate + (slope1 * utilization) / WAD;
  } else {
    // Above kink: base + slope1 * kink / WAD + slope2 * (util - kink) / WAD
    const belowKink = (slope1 * kink) / WAD;
    const aboveKink = (slope2 * (utilization - kink)) / WAD;
    return baseRate + belowKink + aboveKink;
  }
}
