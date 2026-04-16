use anchor_lang::prelude::*;

/// Crank-attested price cache for a market's collateral mint.
///
/// One PriceCache exists per Paralend market. A permissioned off-chain
/// attester (typically a daemon reading the Kalshi REST API) pushes recent
/// spot prices via `attest_price`. Each attestation is:
///   1. deviation-checked against the previous EMA (reject if > 5%)
///   2. folded into an exponentially-weighted moving average
///   3. timestamped for staleness checks on reads
///
/// Consumers (borrow, withdraw_collateral, liquidate) read `ema_price_wad`
/// and reject if `last_update_ts` is older than `MAX_ORACLE_AGE` seconds.
///
/// Price convention (unchanged from v1):
///   price_wad = USD per **base unit** of collateral, WAD-scaled (1e18)
///
/// Example: Kalshi YES token at $0.42 (6 decimals) →
///   price_wad = 0.42 * 1e18 / 1e6 = 420_000_000_000
#[account]
pub struct PriceCache {
    /// PDA bump seed.
    pub bump: u8,

    /// Which market this cache covers (32-byte market_id).
    pub market_id: [u8; 32],

    /// Kalshi/DFlow feed identifier — must match `market.collateral_oracle_feed_id`.
    pub feed_id: [u8; 32],

    /// Only this key can push new spot prices via `attest_price`.
    /// For MVP this is a single keypair or multisig; v2 moves to an
    /// on-chain DFlow CLP TWAP that needs no attester.
    pub attester: Pubkey,

    /// Exponentially-weighted moving average price, WAD-scaled.
    /// Consumers read this field.
    pub ema_price_wad: u128,

    /// Last attested spot, kept for deviation bounding on the next attestation.
    pub last_spot_wad: u128,

    /// Slot of the last attestation (0 before first push).
    pub last_update_slot: u64,

    /// Unix timestamp of the last attestation (used for staleness checks).
    pub last_update_ts: i64,

    /// Reserved for future fields (alpha, hysteresis, etc.).
    pub reserved: [u8; 64],
}

impl PriceCache {
    pub const SPACE: usize = 8 // discriminator
        + 1   // bump
        + 32  // market_id
        + 32  // feed_id
        + 32  // attester
        + 16  // ema_price_wad
        + 16  // last_spot_wad
        + 8   // last_update_slot
        + 8   // last_update_ts
        + 64; // reserved
}
