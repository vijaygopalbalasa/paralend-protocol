use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

#[account]
pub struct Market {
    /// PDA bump seed
    pub bump: u8,

    /// Collateral vault PDA bump
    pub collateral_vault_bump: u8,

    /// Loan vault PDA bump
    pub loan_vault_bump: u8,

    /// Collateral token mint
    pub collateral_mint: Pubkey,

    /// Loan token mint
    pub loan_mint: Pubkey,

    /// Cached collateral token decimals
    pub collateral_decimals: u8,

    /// Cached loan token decimals
    pub loan_decimals: u8,

    /// Pyth price feed ID for collateral/USD
    pub collateral_oracle_feed_id: [u8; 32],

    /// Pyth price feed ID for loan/USD (all zeros = assume $1 for stablecoins)
    pub loan_oracle_feed_id: [u8; 32],

    /// Interest rate model account
    pub irm: Pubkey,

    /// Liquidation loan-to-value in BPS (e.g., 8600 = 86%)
    pub lltv: u64,

    /// Protocol fee in BPS (e.g., 1000 = 10%)
    pub fee: u64,

    /// Total loan token assets supplied (grows with interest)
    pub total_supply_assets: u128,

    /// Total supply shares outstanding
    pub total_supply_shares: u128,

    /// Total loan tokens borrowed (grows with interest)
    pub total_borrow_assets: u128,

    /// Total borrow shares outstanding
    pub total_borrow_shares: u128,

    /// Unclaimed protocol fee shares
    pub pending_fee_shares: u128,

    /// Last interest accrual timestamp (unix)
    pub last_update: i64,

    /// Market-level pause flag
    pub paused: bool,

    /// Market lifecycle status (0=Active, 1=PreResolution, 2=Resolved)
    pub market_status: u8,

    /// Outcome bit after resolution (0=unresolved, 1=YES won, 2=NO won)
    pub outcome_bit: u8,

    /// Unix timestamp when this prediction market resolves. 0 = no scheduled resolution.
    pub resolution_timestamp: i64,

    /// Base liquidation LTV in BPS — effective LLTV decays as resolution approaches.
    pub base_lltv: u64,

    /// Kalshi market ticker (e.g., "KXNBAFINAL-26MAYLAL") — display metadata.
    pub kalshi_ticker: [u8; 48],

    /// Reserved for future use
    pub reserved: [u8; 16],
}

impl Market {
    pub const SPACE: usize = 8 // discriminator
        + 1  // bump
        + 1  // collateral_vault_bump
        + 1  // loan_vault_bump
        + 32 // collateral_mint
        + 32 // loan_mint
        + 1  // collateral_decimals
        + 1  // loan_decimals
        + 32 // collateral_oracle_feed_id
        + 32 // loan_oracle_feed_id
        + 32 // irm
        + 8  // lltv
        + 8  // fee
        + 16 // total_supply_assets
        + 16 // total_supply_shares
        + 16 // total_borrow_assets
        + 16 // total_borrow_shares
        + 16 // pending_fee_shares
        + 8  // last_update
        + 1  // paused
        + 1  // market_status
        + 1  // outcome_bit
        + 8  // resolution_timestamp
        + 8  // base_lltv
        + 48 // kalshi_ticker
        + 16; // reserved

    /// Check if the market has available liquidity for borrowing/withdrawal
    pub fn available_liquidity(&self) -> u128 {
        self.total_supply_assets.saturating_sub(self.total_borrow_assets)
    }
}

/// Compute the deterministic market ID from market parameters
/// market_id = keccak256(collateral_mint, loan_mint, collateral_oracle_feed_id, loan_oracle_feed_id, irm, lltv)
pub fn compute_market_id(
    collateral_mint: &Pubkey,
    loan_mint: &Pubkey,
    collateral_oracle_feed_id: &[u8; 32],
    loan_oracle_feed_id: &[u8; 32],
    irm: &Pubkey,
    lltv: u64,
) -> [u8; 32] {
    let mut data = Vec::with_capacity(32 + 32 + 32 + 32 + 32 + 8);
    data.extend_from_slice(collateral_mint.as_ref());
    data.extend_from_slice(loan_mint.as_ref());
    data.extend_from_slice(collateral_oracle_feed_id);
    data.extend_from_slice(loan_oracle_feed_id);
    data.extend_from_slice(irm.as_ref());
    data.extend_from_slice(&lltv.to_le_bytes());
    keccak::hash(&data).to_bytes()
}
