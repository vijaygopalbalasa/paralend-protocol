use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::interfaces::oracle::{get_loan_price, is_position_healthy, read_static_oracle_price};
use crate::math::interest::accrue_interest_on_market;
use crate::state::irm::LinearIrm;
use crate::state::market::Market;
use crate::state::oracle::StaticOracle;
use crate::state::position::Position;
use crate::state::protocol::ProtocolState;

// ─── Supply Collateral ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(market_id: [u8; 32], amount: u64)]
pub struct SupplyCollateral<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Protocol state — blocks deposits when globally paused.
    #[account(
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = !protocol_state.paused @ ParalendError::ProtocolPaused,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    /// Market account — blocks deposits on paused or resolved markets.
    #[account(
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
        constraint = !market.paused @ ParalendError::MarketPaused,
        constraint = market.market_status == 0 @ ParalendError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,

    /// Depositor's position in this market
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, depositor.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == depositor.key() @ ParalendError::Unauthorized,
        constraint = position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub position: Account<'info, Position>,

    /// Source: depositor's collateral token account
    #[account(
        mut,
        token::mint = market.collateral_mint,
        token::authority = depositor,
    )]
    pub depositor_collateral_ata: Account<'info, TokenAccount>,

    /// Destination: market's collateral vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_COLLATERAL_VAULT, &market_id],
        bump = market.collateral_vault_bump,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_supply_collateral(
    ctx: Context<SupplyCollateral>,
    _market_id: [u8; 32],
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ParalendError::ZeroAmount);

    // CEI: Effect (state update) BEFORE Interaction (token transfer).
    // Prior order was inverted; kept safe on classic SPL only because that
    // token program has no hooks. Ordering like this lets us safely adopt
    // Token-2022 later without re-opening the reentrancy window.
    let position = &mut ctx.accounts.position;
    position.collateral = position
        .collateral
        .checked_add(amount as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    let market_id_copy = position.market_id;
    let depositor_key = ctx.accounts.depositor.key();

    // Transfer collateral from depositor to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_collateral_ata.to_account_info(),
                to: ctx.accounts.collateral_vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(events::CollateralSupplied {
        market_id: market_id_copy,
        depositor: depositor_key,
        on_behalf_of: depositor_key,
        amount: amount as u128,
    });

    Ok(())
}

// ─── Withdraw Collateral ──────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(market_id: [u8; 32], amount: u64)]
pub struct WithdrawCollateral<'info> {
    pub owner: Signer<'info>,

    /// Market state — mutable because we accrue interest before the health check
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    /// IRM account needed for interest accrual
    #[account(
        constraint = irm.key() == market.irm @ ParalendError::IrmNotEnabled,
    )]
    pub irm: Box<Account<'info, LinearIrm>>,

    /// Owner's position in this market
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, owner.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == owner.key() @ ParalendError::Unauthorized,
        constraint = position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Source: market's collateral vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_COLLATERAL_VAULT, &market_id],
        bump = market.collateral_vault_bump,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Destination: receiver's collateral token account
    #[account(
        mut,
        token::mint = market.collateral_mint,
    )]
    pub receiver_collateral_ata: Account<'info, TokenAccount>,

    /// Collateral price oracle (StaticOracle for localnet; Pyth on mainnet Day 5)
    /// Only read if position has debt.
    /// CHECK: feed_id validated against market.collateral_oracle_feed_id in handler
    pub collateral_oracle: Account<'info, StaticOracle>,

    /// Loan price oracle (StaticOracle for localnet; Pyth on mainnet Day 5)
    /// Only read if position has debt AND market.loan_oracle_feed_id != [0u8; 32].
    /// For stablecoin loan markets (loan_oracle_feed_id = [0u8; 32]), price = $1/full_token.
    /// CHECK: feed_id validated against market.loan_oracle_feed_id in handler (if non-zero)
    pub loan_oracle: Account<'info, StaticOracle>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_withdraw_collateral(
    ctx: Context<WithdrawCollateral>,
    market_id: [u8; 32],
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ParalendError::ZeroAmount);

    let position = &ctx.accounts.position;
    require!(
        position.collateral >= amount as u128,
        ParalendError::InsufficientCollateral
    );

    // Accrue interest before health check so we use up-to-date debt figures
    let clock = Clock::get()?;
    accrue_interest_on_market(
        &mut ctx.accounts.market,
        &ctx.accounts.irm,
        clock.unix_timestamp,
    )?;

    // Update collateral before health check (check AFTER, not before)
    let position = &mut ctx.accounts.position;
    position.collateral = position
        .collateral
        .checked_sub(amount as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Health check: only required if position has debt
    if position.has_debt() {
        let collateral_price_wad = read_static_oracle_price(
            &ctx.accounts.collateral_oracle,
            &ctx.accounts.market.collateral_oracle_feed_id,
        )?;
        let loan_price_wad = get_loan_price(&ctx.accounts.market, &ctx.accounts.loan_oracle)?;

        let healthy = is_position_healthy(
            &ctx.accounts.market,
            position.collateral,
            position.borrow_shares,
            collateral_price_wad,
            loan_price_wad,
        )?;
        require!(healthy, ParalendError::PositionUnhealthy);
    }

    // Transfer collateral from vault to receiver, signed by market PDA
    let market_id_bytes = market_id;
    let bump = ctx.accounts.market.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[SEED_PREFIX, SEED_MARKET, &market_id_bytes, &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.receiver_collateral_ata.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    emit!(events::CollateralWithdrawn {
        market_id: ctx.accounts.position.market_id,
        caller: ctx.accounts.owner.key(),
        receiver: ctx.accounts.receiver_collateral_ata.key(),
        amount: amount as u128,
    });

    Ok(())
}
