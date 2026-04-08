import { PublicKey } from "@solana/web3.js";

// Program address
export const PROGRAM_ID = new PublicKey(
  "BDZo1obAjSPufJsRqJmBy82whgQfedDXnTDipdA2nCVn"
);

// Fixed-point arithmetic constants
export const WAD = BigInt("1000000000000000000"); // 1e18
export const BPS = BigInt(10_000); // 100% in basis points

// Inflation-attack guard (ERC-4626 style virtual offsets)
export const VIRTUAL_SHARES = BigInt(1_000_000); // 1e6
export const VIRTUAL_ASSETS = BigInt(1);

// Time
export const SECONDS_PER_YEAR = BigInt(31_536_000);

// Oracle
export const MAX_ORACLE_AGE = 60; // seconds

// Protocol limits
export const MAX_FEE_BPS = BigInt(2_500); // 25%
export const MAX_LIF = BigInt(11_500); // 115%
export const LIF_CURSOR = BigInt(3_000); // 30%
export const FLASH_LOAN_FEE_BPS = BigInt(5); // 0.05%

// PDA seeds (Buffer for use with findProgramAddressSync)
export const SEED_PREFIX = Buffer.from("nucleus");
export const SEED_PROTOCOL = Buffer.from("protocol_state");
export const SEED_MARKET = Buffer.from("market");
export const SEED_POSITION = Buffer.from("position");
export const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
export const SEED_LOAN_VAULT = Buffer.from("loan_vault");
export const SEED_LINEAR_IRM = Buffer.from("linear_irm");
export const SEED_STATIC_ORACLE = Buffer.from("static_oracle");
