use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::NucleusError;
use crate::events;
use crate::math::interest::accrue_interest_on_market;
use crate::state::irm::LinearIrm;
use crate::state::market::Market;
use crate::state::position::Position;
use crate::state::protocol::ProtocolState;

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
        constraint = market.flash_loan_lock == 0 @ NucleusError::FlashLoanLocked,
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

// ─── Claim Fees ──────────────────────────────────────────────────────────────
//
// The fee_recipient (from protocol_state) can claim accumulated pending_fee_shares
// from any market. The shares are credited to the fee_recipient's Position account.

/// Claim accumulated protocol fee shares from a market.
/// Only the fee_recipient from protocol_state can call this.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ClaimFees<'info> {
    #[account(mut)]
    pub fee_recipient: Signer<'info>,

    #[account(
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.fee_recipient == fee_recipient.key() @ NucleusError::Unauthorized,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
        constraint = market.flash_loan_lock == 0 @ NucleusError::FlashLoanLocked,
    )]
    pub market: Box<Account<'info, Market>>,

    /// The fee_recipient's position in this market.
    /// If it doesn't exist, the caller must create it first via create_position.
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, fee_recipient.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == fee_recipient.key() @ NucleusError::Unauthorized,
    )]
    pub position: Box<Account<'info, Position>>,
}

pub fn handle_claim_fees(ctx: Context<ClaimFees>, market_id: [u8; 32]) -> Result<()> {
    let pending_shares = ctx.accounts.market.pending_fee_shares;

    // Nothing to claim
    if pending_shares == 0 {
        return Ok(());
    }

    // Transfer pending_fee_shares to the fee_recipient's position
    ctx.accounts.position.supply_shares = ctx
        .accounts
        .position
        .supply_shares
        .checked_add(pending_shares)
        .ok_or_else(|| error!(NucleusError::MathOverflow))?;

    // Reset pending fee shares on the market
    ctx.accounts.market.pending_fee_shares = 0;

    emit!(events::FeesClaimed {
        market_id,
        fee_recipient: ctx.accounts.fee_recipient.key(),
        shares: pending_shares,
    });

    Ok(())
}
