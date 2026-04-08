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

/// Flash loan fee: 0.05%
pub const FLASH_LOAN_FEE_BPS: u64 = 5;

/// Liquidation incentive factor parameters
/// Maximum LIF: 115% (liquidator gets at most 15% bonus)
pub const MAX_LIF: u64 = 11_500;
/// LIF cursor: 30% (controls the steepness of the incentive curve)
pub const LIF_CURSOR: u64 = 3_000;
/// LIF basis points scale
pub const LIF_BPS: u64 = 10_000;

/// Maximum oracle price age (seconds)
pub const MAX_ORACLE_AGE: u64 = 60;

/// Maximum oracle confidence deviation (5% of price)
pub const MAX_ORACLE_CONF_PCT: u64 = 5;

/// Maximum number of enabled LLTVs
pub const MAX_LLTVS: usize = 20;

/// Maximum number of enabled IRMs
pub const MAX_IRMS: usize = 10;

/// PDA seed prefix
pub const SEED_PREFIX: &[u8] = b"nucleus";
pub const SEED_PROTOCOL: &[u8] = b"protocol_state";
pub const SEED_MARKET: &[u8] = b"market";
pub const SEED_POSITION: &[u8] = b"position";
pub const SEED_COLLATERAL_VAULT: &[u8] = b"collateral_vault";
pub const SEED_LOAN_VAULT: &[u8] = b"loan_vault";
pub const SEED_LINEAR_IRM: &[u8] = b"linear_irm";
pub const SEED_STATIC_ORACLE: &[u8] = b"static_oracle";
