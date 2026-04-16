use anchor_lang::prelude::*;

#[account]
pub struct Position {
    /// PDA bump seed
    pub bump: u8,

    /// Market ID this position belongs to
    pub market_id: [u8; 32],

    /// Position owner
    pub owner: Pubkey,

    /// Lender's supply share balance
    pub supply_shares: u128,

    /// Borrower's debt share balance
    pub borrow_shares: u128,

    /// Raw collateral token amount (not interest-bearing, tracks exact deposited amount)
    pub collateral: u128,

    /// Reserved for future use
    pub reserved: [u8; 64],
}

impl Position {
    pub const SPACE: usize = 8 // discriminator
        + 1  // bump
        + 32 // market_id
        + 32 // owner
        + 16 // supply_shares
        + 16 // borrow_shares
        + 16 // collateral
        + 64; // reserved

    /// Check if the position is completely empty (can be closed)
    pub fn is_empty(&self) -> bool {
        self.supply_shares == 0 && self.borrow_shares == 0 && self.collateral == 0
    }

    /// Check if the position has any debt
    pub fn has_debt(&self) -> bool {
        self.borrow_shares > 0
    }
}
