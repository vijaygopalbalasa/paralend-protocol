import { PublicKey } from "@solana/web3.js";

// ─── Market / Position Parameters ────────────────────────────────────────────

/**
 * The five parameters that uniquely identify a Paralend market.
 * market_id = keccak256(collateralMint ++ loanMint ++ collateralOracleFeedId ++
 *                        loanOracleFeedId ++ irm ++ lltv_le_bytes)
 */
export interface MarketParams {
  /** Collateral token mint */
  collateralMint: PublicKey;
  /** Loan token mint */
  loanMint: PublicKey;
  /** Pyth price feed ID for collateral/USD — 32 bytes */
  collateralOracleFeedId: Buffer;
  /** Pyth price feed ID for loan/USD — 32 zero bytes for stablecoin shortcut */
  loanOracleFeedId: Buffer;
  /** LinearIrm account public key */
  irm: PublicKey;
  /** Liquidation LTV in BPS (e.g. 8600n = 86%) */
  lltv: bigint;
}

// ─── On-chain Account Mirrors ─────────────────────────────────────────────────

/**
 * Deserialized Market account.
 * All u128/u64 on-chain values are represented as bigint.
 */
export interface MarketState {
  /** PDA bump seed */
  bump: number;
  /** Collateral vault PDA bump */
  collateralVaultBump: number;
  /** Loan vault PDA bump */
  loanVaultBump: number;
  /** Collateral token mint */
  collateralMint: PublicKey;
  /** Loan token mint */
  loanMint: PublicKey;
  /** Cached collateral token decimals */
  collateralDecimals: number;
  /** Cached loan token decimals */
  loanDecimals: number;
  /** Pyth price feed ID for collateral — 32 bytes */
  collateralOracleFeedId: number[];
  /** Pyth price feed ID for loan — 32 bytes; all-zeros = stablecoin $1 */
  loanOracleFeedId: number[];
  /** Interest rate model account */
  irm: PublicKey;
  /** Liquidation LTV in BPS (e.g. 8600n = 86%) */
  lltv: bigint;
  /** Protocol fee in BPS (e.g. 1000n = 10%) */
  fee: bigint;
  /** Total loan token assets supplied (grows with interest) */
  totalSupplyAssets: bigint;
  /** Total supply shares outstanding */
  totalSupplyShares: bigint;
  /** Total loan tokens borrowed (grows with interest) */
  totalBorrowAssets: bigint;
  /** Total borrow shares outstanding */
  totalBorrowShares: bigint;
  /** Unclaimed protocol fee shares */
  pendingFeeShares: bigint;
  /** Last interest accrual timestamp (unix seconds) */
  lastUpdate: bigint;
  /** Market-level pause flag */
  paused: boolean;
  /** Market lifecycle status (0 = Active, 1 = PreResolution, 2 = Resolved) */
  marketStatus: number;
  /** Outcome bit after resolution (0 = unresolved, 1 = YES won, 2 = NO won) */
  outcomeBit: number;
  /** Unix timestamp when this prediction market resolves. 0 = no scheduled resolution */
  resolutionTimestamp: bigint;
  /** Base liquidation LTV in BPS — effective LLTV decays as resolution approaches */
  baseLltv: bigint;
  /** Kalshi market ticker bytes (UTF-8, zero-padded to 48 bytes) */
  kalshiTicker: number[];
}

/**
 * Deserialized Position account.
 */
export interface PositionState {
  /** PDA bump seed */
  bump: number;
  /** Market ID this position belongs to (32 bytes) */
  marketId: number[];
  /** Position owner */
  owner: PublicKey;
  /** Lender's supply share balance */
  supplyShares: bigint;
  /** Borrower's debt share balance */
  borrowShares: bigint;
  /** Raw collateral token amount (not interest-bearing) */
  collateral: bigint;
}

/**
 * LinearIrm parameters — matches the on-chain LinearIrm account fields.
 * All rates are WAD-scaled per-second.
 */
export interface IrmParams {
  /** Base rate per second (WAD-scaled). Usually 0. */
  baseRate: bigint;
  /** Slope below the kink (WAD-scaled per second per unit of utilization) */
  slope1: bigint;
  /** Slope above the kink (WAD-scaled per second per unit of utilization) */
  slope2: bigint;
  /** Utilization kink point (WAD-scaled, e.g. 0.8 WAD = 80%) */
  kink: bigint;
}

/**
 * Deserialized LinearIrm account.
 */
export interface IrmState extends IrmParams {
  bump: number;
  admin: PublicKey;
}

/**
 * Deserialized StaticOracle account (localnet / devnet testing).
 */
export interface StaticOracleState {
  bump: number;
  /** Feed ID — must match market's oracle feed ID */
  feedId: number[];
  /** USD price per base unit, WAD-scaled */
  priceWad: bigint;
  /** Only this account can update the price */
  admin: PublicKey;
}

/**
 * Deserialized ProtocolState account.
 */
export interface ProtocolState {
  bump: number;
  /** Protocol admin who can enable LLTVs, IRMs, set fees, pause */
  owner: PublicKey;
  /** Address for two-step ownership transfer */
  pendingOwner: PublicKey;
  /** Address that receives protocol fee shares */
  feeRecipient: PublicKey;
  /** Global pause flag */
  paused: boolean;
  /** Number of enabled LLTV values */
  lltvCount: number;
  /** Whitelisted LLTV values in BPS (e.g. 8600 = 86%) */
  enabledLltvs: bigint[];
  /** Number of enabled IRM accounts */
  irmCount: number;
  /** Whitelisted IRM account public keys */
  enabledIrms: PublicKey[];
  /** Total number of markets created */
  marketCount: bigint;
}
