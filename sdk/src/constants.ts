import { PublicKey } from "@solana/web3.js";

// Program address
export const PROGRAM_ID = new PublicKey(
  "2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8"
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
export const MAX_ORACLE_AGE = 30; // seconds — tightened for Paralend

// Protocol limits
export const MAX_FEE_BPS = BigInt(2_500); // 25%
export const MAX_LIF = BigInt(11_500); // 115%
export const LIF_CURSOR = BigInt(3_000); // 30%

// Paralend — prediction-market credit specifics
export const MAX_BINARY_LLTV = BigInt(7_000); // 70% cap on prediction-market collateral
export const MAX_PRICE_DEVIATION_BPS = BigInt(500); // 5% — EMA vs spot deviation band
export const EMA_HALF_LIFE_SLOTS = BigInt(150); // ~60s on Solana (400ms slot)
export const FORCE_CLOSE_WINDOW_SECONDS = 7_200; // 2h pre-resolution window
export const POST_BORROW_CUTOFF_SECONDS = 1_800; // 30min pre-resolution no-borrow
export const LIQUIDATOR_BOUNTY_MIN_BPS = BigInt(50); // 0.5%
export const LIQUIDATOR_BOUNTY_MAX_BPS = BigInt(300); // 3.0%

// PDA seeds (Buffer for use with findProgramAddressSync)
export const SEED_PREFIX = Buffer.from("paralend");
export const SEED_PROTOCOL = Buffer.from("protocol_state");
export const SEED_MARKET = Buffer.from("market");
export const SEED_POSITION = Buffer.from("position");
export const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
export const SEED_LOAN_VAULT = Buffer.from("loan_vault");
export const SEED_LINEAR_IRM = Buffer.from("linear_irm");
export const SEED_PRICE_CACHE = Buffer.from("price_cache");
export const SEED_RESOLUTION_RECORD = Buffer.from("resolution_record");
