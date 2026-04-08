use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::NucleusError;
use crate::events;
use crate::math::interest::accrue_interest_on_market;
use crate::state::irm::LinearIrm;
use crate::state::market::Market;

/// Permissionless crank — anyone can call this to accrue interest on any market.
///
/// This is useful for:
/// 1. Keeping interest up-to-date on inactive markets
/// 2. Ensuring pending_fee_shares accumulate for the fee recipient
/// 3. SDK / indexer reads wanting accurate APY data
///
/// Every instruction that mutates market state already calls accrue internally,
/// so this is only needed for markets that haven't had activity in a while.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct AccrueInterest<'info> {
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        constraint = irm.key() == market.irm @ NucleusError::IrmNotEnabled,
    )]
    pub irm: Box<Account<'info, LinearIrm>>,
}

pub fn handle_accrue_interest(
    ctx: Context<AccrueInterest>,
    market_id: [u8; 32],
) -> Result<()> {
    let clock = Clock::get()?;
    let result = accrue_interest_on_market(
        &mut ctx.accounts.market,
        &ctx.accounts.irm,
        clock.unix_timestamp,
    )?;

    emit!(events::InterestAccrued {
        market_id,
        interest: result.interest,
        fee_shares: result.fee_shares,
    });

    Ok(())
}
