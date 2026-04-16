use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::math::interest::accrue_interest_on_market;
use crate::math::shares::{to_assets_down, to_shares_down, to_shares_up};
use crate::math::safe_math::safe_u128_to_u64;
use crate::state::irm::LinearIrm;
use crate::state::market::Market;
use crate::state::position::Position;
use crate::state::protocol::ProtocolState;

// ─── Supply (lender deposits loan tokens) ────────────────────────────────────

#[derive(Accounts)]
#[instruction(market_id: [u8; 32], assets: u64, min_shares: u128)]
pub struct Supply<'info> {
    #[account(mut)]
    pub supplier: Signer<'info>,

    #[account(
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = !protocol_state.paused @ ParalendError::ProtocolPaused,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
        constraint = !market.paused @ ParalendError::MarketPaused,
        constraint = market.flash_loan_lock == 0 @ ParalendError::FlashLoanLocked,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        constraint = irm.key() == market.irm @ ParalendError::IrmNotEnabled,
    )]
    pub irm: Box<Account<'info, LinearIrm>>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, supplier.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == supplier.key() @ ParalendError::Unauthorized,
        constraint = position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Source: supplier's loan token account (e.g. USDC wallet)
    #[account(
        mut,
        token::mint = market.loan_mint,
        token::authority = supplier,
    )]
    pub supplier_loan_ata: Account<'info, TokenAccount>,

    /// Destination: market's loan vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_supply(
    ctx: Context<Supply>,
    _market_id: [u8; 32],
    assets: u64,
    min_shares: u128,
) -> Result<()> {
    require!(assets > 0, ParalendError::ZeroAmount);

    // Accrue interest so shares are priced against current state
    let clock = Clock::get()?;
    accrue_interest_on_market(
        &mut ctx.accounts.market,
        &ctx.accounts.irm,
        clock.unix_timestamp,
    )?;

    let market = &mut ctx.accounts.market;

    // assets → shares, round DOWN (user gets fewer shares — favors protocol)
    let shares = to_shares_down(
        assets as u128,
        market.total_supply_assets,
        market.total_supply_shares,
    )?;

    // Slippage protection: ensure user gets at least min_shares
    require!(shares >= min_shares, ParalendError::SlippageExceeded);

    // Update market totals
    market.total_supply_assets = market
        .total_supply_assets
        .checked_add(assets as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    market.total_supply_shares = market
        .total_supply_shares
        .checked_add(shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Update position
    let position = &mut ctx.accounts.position;
    position.supply_shares = position
        .supply_shares
        .checked_add(shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    let market_id = position.market_id;
    let supplier_key = ctx.accounts.supplier.key();

    // Transfer loan tokens from supplier to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.supplier_loan_ata.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.supplier.to_account_info(),
            },
        ),
        assets,
    )?;

    emit!(events::Supplied {
        market_id,
        supplier: supplier_key,
        assets: assets as u128,
        shares,
    });

    Ok(())
}

// ─── Withdraw (lender redeems loan tokens) ───────────────────────────────────

/// Withdraw works even when the market is paused (users should always be able to exit).
///
/// Specify exactly ONE of `assets` or `shares` (the other must be zero):
/// - `assets > 0`: withdraw exactly `assets` tokens, burns `to_shares_up(assets)` shares
/// - `shares > 0`: burn exactly `shares`, receive `to_assets_down(shares)` tokens
#[derive(Accounts)]
#[instruction(market_id: [u8; 32], assets: u64, shares: u128, max_shares_burn: u128, min_assets_out: u128)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
        constraint = market.flash_loan_lock == 0 @ ParalendError::FlashLoanLocked,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        constraint = irm.key() == market.irm @ ParalendError::IrmNotEnabled,
    )]
    pub irm: Box<Account<'info, LinearIrm>>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, owner.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == owner.key() @ ParalendError::Unauthorized,
        constraint = position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Source: market's loan vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: Account<'info, TokenAccount>,

    /// Destination: receiver's loan token account
    #[account(
        mut,
        token::mint = market.loan_mint,
    )]
    pub receiver_loan_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_withdraw(
    ctx: Context<Withdraw>,
    market_id: [u8; 32],
    assets: u64,
    shares: u128,
    max_shares_burn: u128,
    min_assets_out: u128,
) -> Result<()> {
    // Exactly one of assets or shares must be non-zero
    require!(
        (assets == 0) != (shares == 0),
        ParalendError::InvalidInput
    );

    // Accrue interest before computing share/asset values
    let clock = Clock::get()?;
    accrue_interest_on_market(
        &mut ctx.accounts.market,
        &ctx.accounts.irm,
        clock.unix_timestamp,
    )?;

    let market = &mut ctx.accounts.market;

    // Resolve (final_assets, final_shares) — both sides of the withdrawal
    let (final_assets, final_shares) = if assets > 0 {
        // User specifies assets to receive → compute shares to burn (round UP)
        let shares_to_burn = to_shares_up(
            assets as u128,
            market.total_supply_assets,
            market.total_supply_shares,
        )?;
        (assets as u128, shares_to_burn)
    } else {
        // User specifies shares to burn → compute assets to receive (round DOWN)
        let assets_out = to_assets_down(
            shares,
            market.total_supply_assets,
            market.total_supply_shares,
        )?;
        (assets_out, shares)
    };

    require!(final_assets > 0, ParalendError::ZeroAmount);

    // Slippage protection (0 = no protection, backwards compatible)
    // When withdrawing by assets: ensure user doesn't burn more shares than expected
    if assets > 0 && max_shares_burn > 0 {
        require!(final_shares <= max_shares_burn, ParalendError::SlippageExceeded);
    }
    // When withdrawing by shares: ensure user gets at least min_assets
    if shares > 0 && min_assets_out > 0 {
        require!(final_assets >= min_assets_out, ParalendError::SlippageExceeded);
    }

    // Check position has enough shares to burn
    let position = &ctx.accounts.position;
    require!(
        position.supply_shares >= final_shares,
        ParalendError::InsufficientShares
    );

    // Check market has enough free liquidity (not borrowed out)
    require!(
        market.available_liquidity() >= final_assets,
        ParalendError::InsufficientLiquidity
    );

    // Update market totals
    market.total_supply_assets = market
        .total_supply_assets
        .checked_sub(final_assets)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    market.total_supply_shares = market
        .total_supply_shares
        .checked_sub(final_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Update position
    let position = &mut ctx.accounts.position;
    position.supply_shares = position
        .supply_shares
        .checked_sub(final_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    let market_id_copy = position.market_id;
    let caller_key = ctx.accounts.owner.key();
    let receiver_key = ctx.accounts.receiver_loan_ata.key();

    // Transfer loan tokens from vault to receiver — market PDA signs
    let bump = ctx.accounts.market.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[SEED_PREFIX, SEED_MARKET, &market_id, &[bump]]];

    let transfer_amount = safe_u128_to_u64(final_assets)?;

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.loan_vault.to_account_info(),
                to: ctx.accounts.receiver_loan_ata.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        transfer_amount,
    )?;

    emit!(events::Withdrawn {
        market_id: market_id_copy,
        caller: caller_key,
        receiver: receiver_key,
        assets: final_assets,
        shares: final_shares,
    });

    Ok(())
}
