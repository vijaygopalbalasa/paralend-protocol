use anchor_lang::prelude::*;

#[event]
pub struct ProtocolInitialized {
    pub owner: Pubkey,
    pub fee_recipient: Pubkey,
}

#[event]
pub struct LltvEnabled {
    pub lltv: u64,
}

#[event]
pub struct IrmEnabled {
    pub irm: Pubkey,
}

#[event]
pub struct MarketCreated {
    pub market_id: [u8; 32],
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub irm: Pubkey,
    pub lltv: u64,
}

#[event]
pub struct Supplied {
    pub market_id: [u8; 32],
    pub supplier: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct Withdrawn {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub receiver: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct CollateralSupplied {
    pub market_id: [u8; 32],
    pub depositor: Pubkey,
    pub on_behalf_of: Pubkey,
    pub amount: u128,
}

#[event]
pub struct CollateralWithdrawn {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub receiver: Pubkey,
    pub amount: u128,
}

#[event]
pub struct Borrowed {
    pub market_id: [u8; 32],
    pub borrower: Pubkey,
    pub receiver: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct Repaid {
    pub market_id: [u8; 32],
    pub repayer: Pubkey,
    pub on_behalf_of: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct Liquidated {
    pub market_id: [u8; 32],
    pub liquidator: Pubkey,
    pub borrower: Pubkey,
    pub repaid_assets: u128,
    pub repaid_shares: u128,
    pub seized_collateral: u128,
    pub bad_debt_assets: u128,
    pub bad_debt_shares: u128,
}

#[event]
pub struct InterestAccrued {
    pub market_id: [u8; 32],
    pub interest: u128,
    pub fee_shares: u128,
}

#[event]
pub struct FeesClaimed {
    pub market_id: [u8; 32],
    pub fee_recipient: Pubkey,
    pub shares: u128,
}

#[event]
pub struct OwnershipTransferInitiated {
    pub old_owner: Pubkey,
    pub pending_owner: Pubkey,
}

#[event]
pub struct OwnershipTransferAccepted {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct PriceCacheRegistered {
    pub market_id: [u8; 32],
    pub feed_id: [u8; 32],
    pub attester: Pubkey,
    pub initial_price_wad: u128,
}

#[event]
pub struct PriceAttested {
    pub market_id: [u8; 32],
    pub spot_wad: u128,
    pub ema_wad: u128,
    pub slot: u64,
}

#[event]
pub struct PriceCachePoked {
    pub market_id: [u8; 32],
    pub slot: u64,
}
