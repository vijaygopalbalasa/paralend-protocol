use anchor_lang::prelude::*;

use crate::constants::*;
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
