use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::NucleusError;
use crate::state::market::Market;
use crate::state::position::Position;

/// Create a new position for a user in a market
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct CreatePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The owner of the position. Anyone can create a position for anyone.
    pub owner: UncheckedAccount<'info>,

    #[account(
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = payer,
        space = Position::SPACE,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, owner.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_position(ctx: Context<CreatePosition>, market_id: [u8; 32]) -> Result<()> {
    let position = &mut ctx.accounts.position;
    position.bump = ctx.bumps.position;
    position.market_id = market_id;
    position.owner = ctx.accounts.owner.key();
    position.supply_shares = 0;
    position.borrow_shares = 0;
    position.collateral = 0;
    position.reserved = [0u8; 64];

    Ok(())
}

// ─── Close Position ──────────────────────────────────────────────────────────

/// Close an empty position and reclaim rent.
///
/// The position must have:
/// - 0 supply shares
/// - 0 borrow shares
/// - 0 collateral
///
/// Rent is returned to the position owner.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ClosePosition<'info> {
    /// Position owner must sign to close
    pub owner: Signer<'info>,

    /// Rent recipient — typically the owner, but can be different
    /// CHECK: Any account can receive the rent
    #[account(mut)]
    pub rent_recipient: UncheckedAccount<'info>,

    #[account(
        mut,
        close = rent_recipient,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, owner.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == owner.key() @ NucleusError::Unauthorized,
        constraint = position.market_id == market_id @ NucleusError::Unauthorized,
    )]
    pub position: Account<'info, Position>,
}

pub fn handle_close_position(ctx: Context<ClosePosition>, _market_id: [u8; 32]) -> Result<()> {
    let position = &ctx.accounts.position;

    // Verify position is completely empty
    require!(position.is_empty(), NucleusError::PositionNotEmpty);

    // Account closure is handled by Anchor's `close = rent_recipient` constraint
    // No additional logic needed — rent is automatically returned

    Ok(())
}
