use anchor_lang::prelude::*;

/// Static oracle account for localnet testing and devnet demos.
///
/// On mainnet, oracle prices come from Pyth PriceUpdateV2 accounts (Day 5).
/// This account lets us set arbitrary prices in tests and stage liquidation scenarios.
///
/// Price convention:
///   price_wad = USD value per **base unit** (smallest denomination), WAD-scaled (1e18)
///
/// Examples:
///   SOL at $140, 9 decimals → price_wad = 140 * 1e18 / 1e9 = 140_000_000_000
///   USDC at $1,  6 decimals → price_wad = 1   * 1e18 / 1e6 = 1_000_000_000_000
///   BTC at $95k, 8 decimals → price_wad = 95_000 * 1e18 / 1e8 = 950_000_000_000_000
#[account]
pub struct StaticOracle {
    /// PDA bump seed
    pub bump: u8,

    /// Feed ID — must match market.collateral_oracle_feed_id or loan_oracle_feed_id
    pub feed_id: [u8; 32],

    /// USD price per base unit, WAD-scaled
    pub price_wad: u128,

    /// Only this account can update the price
    pub admin: Pubkey,
}

impl StaticOracle {
    pub const SPACE: usize = 8  // discriminator
        + 1   // bump
        + 32  // feed_id
        + 16  // price_wad
        + 32; // admin
}
