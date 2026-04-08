use crate::constants::{MAX_IRMS, MAX_LLTVS};
use anchor_lang::prelude::*;

#[account]
pub struct ProtocolState {
    /// PDA bump seed
    pub bump: u8,

    /// Protocol admin who can enable LLTVs, IRMs, set fees, pause
    pub owner: Pubkey,

    /// Address for two-step ownership transfer
    pub pending_owner: Pubkey,

    /// Address that receives protocol fee shares
    pub fee_recipient: Pubkey,

    /// Global pause flag — blocks supply, borrow, collateral operations
    pub paused: bool,

    /// Number of enabled LLTV values
    pub lltv_count: u8,

    /// Whitelisted LLTV values in BPS (e.g., 8600 = 86%)
    pub enabled_lltvs: [u64; MAX_LLTVS],

    /// Number of enabled IRM accounts
    pub irm_count: u8,

    /// Whitelisted IRM account pubkeys
    pub enabled_irms: [Pubkey; MAX_IRMS],

    /// Total number of markets created
    pub market_count: u64,

    /// Reserved space for future upgrades
    pub reserved: [u8; 256],
}

impl ProtocolState {
    pub const SPACE: usize = 8 // discriminator
        + 1  // bump
        + 32 // owner
        + 32 // pending_owner
        + 32 // fee_recipient
        + 1  // paused
        + 1  // lltv_count
        + (8 * MAX_LLTVS) // enabled_lltvs
        + 1  // irm_count
        + (32 * MAX_IRMS) // enabled_irms
        + 8  // market_count
        + 256; // reserved

    /// Check if a given LLTV value is enabled
    pub fn is_lltv_enabled(&self, lltv: u64) -> bool {
        for i in 0..self.lltv_count as usize {
            if self.enabled_lltvs[i] == lltv {
                return true;
            }
        }
        false
    }

    /// Check if a given IRM pubkey is enabled
    pub fn is_irm_enabled(&self, irm: &Pubkey) -> bool {
        for i in 0..self.irm_count as usize {
            if self.enabled_irms[i] == *irm {
                return true;
            }
        }
        false
    }
}
