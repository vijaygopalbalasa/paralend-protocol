use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::interfaces::oracle::{get_loan_price, is_position_healthy, read_static_oracle_price};
use crate::math::interest::accrue_interest_on_market;
use crate::math::safe_math::safe_u128_to_u64;
use crate::math::shares::{to_assets_up, to_shares_up};
use crate::state::irm::LinearIrm;
use crate::state::market::Market;
use crate::state::oracle::StaticOracle;
use crate::state::position::Position;
use crate::state::protocol::ProtocolState;

// ─── Borrow ──────────────────────────────────────────────────────────────────

/// Borrow loan tokens from the market using posted collateral.
///
/// `assets` specifies exactly how many tokens to receive.
/// Debt is tracked in shares (round UP — borrower owes more).
/// Health check is performed AFTER updating state (post-borrow health must pass).
#[derive(Accounts)]
#[instruction(market_id: [u8; 32], assets: u64, max_shares: u128)]
pub struct Borrow<'info> {
    pub borrower: Signer<'info>,

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
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        constraint = irm.key() == market.irm @ ParalendError::IrmNotEnabled,
    )]
    pub irm: Box<Account<'info, LinearIrm>>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, borrower.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == borrower.key() @ ParalendError::Unauthorized,
        constraint = position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Source: market's loan vault (protocol lends from here)
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: Account<'info, TokenAccount>,

    /// Destination: borrower's loan token account
    #[account(
        mut,
        token::mint = market.loan_mint,
    )]
    pub receiver_loan_ata: Account<'info, TokenAccount>,

    /// Collateral price oracle — needed for post-borrow health check
    /// CHECK: feed_id validated against market.collateral_oracle_feed_id in handler
    pub collateral_oracle: Account<'info, StaticOracle>,

    /// Loan price oracle — or stablecoin $1 if market.loan_oracle_feed_id == [0u8; 32]
    /// CHECK: feed_id validated in handler (skipped if all-zero = stablecoin)
    pub loan_oracle: Account<'info, StaticOracle>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_borrow(
    ctx: Context<Borrow>,
    market_id: [u8; 32],
    assets: u64,
    max_shares: u128,
) -> Result<()> {
    require!(assets > 0, ParalendError::ZeroAmount);

    // Accrue interest before computing shares (price debt accurately)
    let clock = Clock::get()?;
    accrue_interest_on_market(
        &mut ctx.accounts.market,
        &ctx.accounts.irm,
        clock.unix_timestamp,
    )?;

    let market = &mut ctx.accounts.market;

    // Check available liquidity before taking on debt
    require!(
        market.available_liquidity() >= assets as u128,
        ParalendError::InsufficientLiquidity
    );

    // assets → borrow shares, round UP (borrower owes more — favors protocol)
    let new_shares = to_shares_up(
        assets as u128,
        market.total_borrow_assets,
        market.total_borrow_shares,
    )?;

    // Slippage protection: ensure user doesn't take on more debt shares than expected
    // max_shares = 0 means no slippage protection (backwards compatible)
    if max_shares > 0 {
        require!(new_shares <= max_shares, ParalendError::SlippageExceeded);
    }

    // Update market totals
    market.total_borrow_assets = market
        .total_borrow_assets
        .checked_add(assets as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    market.total_borrow_shares = market
        .total_borrow_shares
        .checked_add(new_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Update position
    let position = &mut ctx.accounts.position;
    position.borrow_shares = position
        .borrow_shares
        .checked_add(new_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Health check AFTER updating state (position must be healthy post-borrow)
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

    let market_id_copy = position.market_id;
    let borrower_key = ctx.accounts.borrower.key();
    let receiver_key = ctx.accounts.receiver_loan_ata.key();

    // Transfer loan tokens from vault to borrower — market PDA signs
    let bump = ctx.accounts.market.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[SEED_PREFIX, SEED_MARKET, &market_id, &[bump]]];

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
        assets,
    )?;

    emit!(events::Borrowed {
        market_id: market_id_copy,
        borrower: borrower_key,
        receiver: receiver_key,
        assets: assets as u128,
        shares: new_shares,
    });

    Ok(())
}

// ─── Repay ───────────────────────────────────────────────────────────────────

/// Repay outstanding debt.
///
/// Specify exactly ONE of `assets` or `shares`:
/// - `assets > 0`: repay exactly `assets` tokens, clears `to_shares_down(assets)` debt shares
/// - `shares > 0`: clear exactly `shares` of debt, pay `to_assets_up(shares)` tokens
///
/// Repay works even when the market is paused (borrowers must always be able to repay).
#[derive(Accounts)]
#[instruction(market_id: [u8; 32], assets: u64, shares: u128)]
pub struct Repay<'info> {
    pub repayer: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        constraint = irm.key() == market.irm @ ParalendError::IrmNotEnabled,
    )]
    pub irm: Box<Account<'info, LinearIrm>>,

    /// The borrower whose debt to repay (may differ from repayer — anyone can repay)
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, borrower.key().as_ref()],
        bump = position.bump,
        constraint = position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub position: Box<Account<'info, Position>>,

    /// CHECK: borrower whose position is being repaid
    pub borrower: UncheckedAccount<'info>,

    /// Source: repayer's loan token account
    #[account(
        mut,
        token::mint = market.loan_mint,
        token::authority = repayer,
    )]
    pub repayer_loan_ata: Account<'info, TokenAccount>,

    /// Destination: market's loan vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_repay(
    ctx: Context<Repay>,
    _market_id: [u8; 32],
    assets: u64,
    shares: u128,
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
    let position = &ctx.accounts.position;

    // Resolve (final_assets, final_shares)
    let (final_assets, final_shares) = if assets > 0 {
        // User specifies assets to pay → compute shares cleared (round DOWN: clear fewer shares)
        // Rounding DOWN on shares cleared = user pays more per share = protocol-favorable
        let shares_cleared = crate::math::shares::to_shares_down(
            assets as u128,
            market.total_borrow_assets,
            market.total_borrow_shares,
        )?;
        (assets as u128, shares_cleared)
    } else {
        // User specifies shares to clear → compute assets to pay (round UP: pay more)
        let assets_in = to_assets_up(
            shares,
            market.total_borrow_assets,
            market.total_borrow_shares,
        )?;
        (assets_in, shares)
    };

    require!(final_assets > 0, ParalendError::ZeroAmount);

    // Cannot repay more than the position owes
    require!(
        position.borrow_shares >= final_shares,
        ParalendError::InsufficientShares
    );

    // Update market totals
    market.total_borrow_assets = market
        .total_borrow_assets
        .checked_sub(final_assets)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    market.total_borrow_shares = market
        .total_borrow_shares
        .checked_sub(final_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Update position
    let position = &mut ctx.accounts.position;
    position.borrow_shares = position
        .borrow_shares
        .checked_sub(final_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    let market_id_copy = position.market_id;
    let repayer_key = ctx.accounts.repayer.key();
    let borrower_key = ctx.accounts.borrower.key();

    // Transfer loan tokens from repayer to vault
    let transfer_amount = safe_u128_to_u64(final_assets)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.repayer_loan_ata.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.repayer.to_account_info(),
            },
        ),
        transfer_amount,
    )?;

    emit!(events::Repaid {
        market_id: market_id_copy,
        repayer: repayer_key,
        on_behalf_of: borrower_key,
        assets: final_assets,
        shares: final_shares,
    });

    Ok(())
}
