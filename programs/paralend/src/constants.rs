/// WAD = 1e18, used for fixed-point arithmetic
pub const WAD: u128 = 1_000_000_000_000_000_000;

/// Basis points denominator (10000 = 100%)
pub const BPS: u64 = 10_000;

/// Maximum protocol fee: 25%
pub const MAX_FEE_BPS: u64 = 2_500;

/// Virtual shares for inflation attack protection (ERC-4626 style)
pub const VIRTUAL_SHARES: u128 = 1_000_000; // 1e6
pub const VIRTUAL_ASSETS: u128 = 1;

/// Seconds per year for APY calculations
pub const SECONDS_PER_YEAR: u128 = 31_536_000;

/// Maximum interest accrual period (7 days) to prevent overflow in Taylor expansion
pub const MAX_INTEREST_ACCRUAL_SECONDS: u128 = 604_800;


/// Liquidation incentive factor parameters
/// Maximum LIF: 115% (liquidator gets at most 15% bonus)
pub const MAX_LIF: u64 = 11_500;
/// LIF cursor: 30% (controls the steepness of the incentive curve)
pub const LIF_CURSOR: u64 = 3_000;
/// LIF basis points scale
pub const LIF_BPS: u64 = 10_000;

/// Maximum oracle price age (seconds) — tightened from 60s to 30s for the PM
/// lending use case where near-resolution volatility makes stale prices costly.
pub const MAX_ORACLE_AGE: u64 = 30;

/// Maximum oracle confidence deviation (5% of price)
pub const MAX_ORACLE_CONF_PCT: u64 = 5;

/// Maximum number of enabled LLTVs
pub const MAX_LLTVS: usize = 20;

/// Maximum number of enabled IRMs
pub const MAX_IRMS: usize = 10;

// ─── Paralend — prediction-market credit specifics ──────────────────────────

/// Hard cap on effective LLTV for binary-outcome collateral. Even if the
/// admin configures a market with higher base_lltv, the resolution-aware
/// health check never permits leverage above this ceiling.
pub const MAX_BINARY_LLTV_BPS: u64 = 7_000; // 70%

/// Spot price deviation (vs EMA cache) beyond which the oracle read is
/// rejected. Replaces the former `MAX_ORACLE_PRICE_CHANGE_BPS = 50_000`
/// (500%) which was a de-facto disabled circuit breaker.
pub const MAX_PRICE_DEVIATION_BPS: u64 = 500; // 5%

/// EMA half-life expressed in slots (Solana = ~400ms per slot).
/// 150 slots ≈ 60 seconds.
pub const EMA_HALF_LIFE_SLOTS: u64 = 150;

/// Force-close window — for 2h before `resolution_timestamp`, any liquidator
/// can close under-water or at-risk positions for a bounty.
pub const FORCE_CLOSE_WINDOW_SECONDS: i64 = 7_200;

/// Hard-stop on new borrows within 30 minutes of `resolution_timestamp`
/// regardless of health. Prevents last-block leverage against binary risk.
pub const POST_BORROW_CUTOFF_SECONDS: i64 = 1_800;

/// Liquidator bounty scales linearly across the force-close window.
pub const LIQUIDATOR_BOUNTY_MIN_BPS: u64 = 50; // 0.5%
pub const LIQUIDATOR_BOUNTY_MAX_BPS: u64 = 300; // 3%

/// PDA seed prefix
pub const SEED_PREFIX: &[u8] = b"paralend";
pub const SEED_PROTOCOL: &[u8] = b"protocol_state";
pub const SEED_MARKET: &[u8] = b"market";
pub const SEED_POSITION: &[u8] = b"position";
pub const SEED_COLLATERAL_VAULT: &[u8] = b"collateral_vault";
pub const SEED_LOAN_VAULT: &[u8] = b"loan_vault";
pub const SEED_LINEAR_IRM: &[u8] = b"linear_irm";
pub const SEED_STATIC_ORACLE: &[u8] = b"static_oracle";
pub const SEED_PRICE_CACHE: &[u8] = b"price_cache";
pub const SEED_RESOLUTION_RECORD: &[u8] = b"resolution_record";
