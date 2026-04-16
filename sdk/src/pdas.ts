import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  SEED_COLLATERAL_VAULT,
  SEED_LINEAR_IRM,
  SEED_LOAN_VAULT,
  SEED_MARKET,
  SEED_POSITION,
  SEED_PREFIX,
  SEED_PROTOCOL,
  SEED_STATIC_ORACLE,
} from "./constants";

/**
 * Derive the ProtocolState singleton PDA.
 * Seeds: ["paralend", "protocol_state"]
 */
export function deriveProtocolStatePDA(
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PROTOCOL],
    programId
  );
}

/**
 * Derive the Market PDA for a given market ID.
 * Seeds: ["paralend", "market", marketId]
 */
export function deriveMarketPDA(
  marketId: Buffer,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_MARKET, marketId],
    programId
  );
}

/**
 * Derive the collateral vault token account PDA for a market.
 * Seeds: ["paralend", "collateral_vault", marketId]
 */
export function deriveCollateralVaultPDA(
  marketId: Buffer,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_COLLATERAL_VAULT, marketId],
    programId
  );
}

/**
 * Derive the loan vault token account PDA for a market.
 * Seeds: ["paralend", "loan_vault", marketId]
 */
export function deriveLoanVaultPDA(
  marketId: Buffer,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LOAN_VAULT, marketId],
    programId
  );
}

/**
 * Derive the Position PDA for (market, owner).
 * Seeds: ["paralend", "position", marketId, owner]
 */
export function derivePositionPDA(
  marketId: Buffer,
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_POSITION, marketId, owner.toBuffer()],
    programId
  );
}

/**
 * Derive the LinearIrm PDA for (admin, nonce).
 * Seeds: ["paralend", "linear_irm", admin, nonce_le_bytes]
 */
export function deriveLinearIrmPDA(
  admin: PublicKey,
  nonce: bigint,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  // Write as 64-bit little-endian. BigInt may be > Number.MAX_SAFE_INTEGER,
  // so we split into two 32-bit halves.
  const lo = Number(nonce & BigInt(0xffffffff));
  const hi = Number((nonce >> BigInt(32)) & BigInt(0xffffffff));
  nonceBuf.writeUInt32LE(lo, 0);
  nonceBuf.writeUInt32LE(hi, 4);

  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LINEAR_IRM, admin.toBuffer(), nonceBuf],
    programId
  );
}

/**
 * Derive the StaticOracle PDA for a given feed ID.
 * Seeds: ["paralend", "static_oracle", feedId]
 */
export function deriveStaticOraclePDA(
  feedId: Buffer,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_STATIC_ORACLE, feedId],
    programId
  );
}
