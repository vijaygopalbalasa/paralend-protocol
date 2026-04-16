use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::interfaces::oracle::{get_loan_price, is_position_healthy, read_price_cache};
use crate::math::interest::accrue_interest_on_market;
use crate::math::safe_math::safe_u128_to_u64;
use crate::math::shares::{to_assets_up, to_shares_down};
use crate::math::wad::{mul_div_down, mul_div_up};
use crate::state::irm::LinearIrm;
use crate::state::market::Market;
use crate::state::oracle::PriceCache;
use crate::state::position::Position;

// ─── Liquidate ───────────────────────────────────────────────────────────────

/// Liquidate an unhealthy position.
///
/// Liquidator specifies `seized_collateral` (how much collateral to take).
/// Protocol computes `repaid_assets` (how much debt is cleared).
///
/// Liquidation Incentive Factor (LIF):
///   lif = min(MAX_LIF, BPS² / (BPS - LIF_CURSOR * (BPS - lltv) / BPS))
///
/// Repaid debt:
///   repaid_assets = seized_collateral * collateral_price / loan_price / lif * BPS
///
/// Bad debt socialization:
///   If after seizing all collateral debt remains (collateral = 0, debt > 0),
///   the residual debt is subtracted from total_supply_assets. Loss is spread
///   proportionally across all lenders via reduced share value.
///
/// Liquidation works even when the market is paused.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32], seized_collateral: u64)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

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

    /// The borrower being liquidated
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, borrower.key().as_ref()],
        bump = borrower_position.bump,
        constraint = borrower_position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub borrower_position: Box<Account<'info, Position>>,

    /// CHECK: the account whose position is being liquidated
    pub borrower: UncheckedAccount<'info>,

    /// Source (debt repayment): liquidator's loan token account
    #[account(
        mut,
        token::mint = market.loan_mint,
        token::authority = liquidator,
    )]
    pub liquidator_loan_ata: Account<'info, TokenAccount>,

    /// Destination (debt repayment): market's loan vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: Account<'info, TokenAccount>,

    /// Source (collateral seizure): market's collateral vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_COLLATERAL_VAULT, &market_id],
        bump = market.collateral_vault_bump,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Destination (collateral seizure): liquidator's collateral token account
    #[account(
        mut,
        token::mint = market.collateral_mint,
    )]
    pub liquidator_collateral_ata: Account<'info, TokenAccount>,

    /// Collateral PriceCache (EMA of attested Kalshi/DFlow prices).
    #[account(
        seeds = [SEED_PREFIX, SEED_PRICE_CACHE, &market_id],
        bump = price_cache.bump,
    )]
    pub price_cache: Account<'info, PriceCache>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_liquidate(
    ctx: Context<Liquidate>,
    market_id: [u8; 32],
    seized_collateral: u64,
) -> Result<()> {
    require!(seized_collateral > 0, ParalendError::ZeroAmount);

    // Accrue interest before any health check
    let clock = Clock::get()?;
    accrue_interest_on_market(
        &mut ctx.accounts.market,
        &ctx.accounts.irm,
        clock.unix_timestamp,
    )?;

    // Read oracle prices
    let collateral_price_wad = read_price_cache(
        &ctx.accounts.price_cache,
        &ctx.accounts.market.collateral_oracle_feed_id,
        &market_id,
    )?;
    let loan_price_wad = get_loan_price(&ctx.accounts.market)?;

    let position = &ctx.accounts.borrower_position;

    // Position must be unhealthy to liquidate
    let healthy = is_position_healthy(
        &ctx.accounts.market,
        position.collateral,
        position.borrow_shares,
        collateral_price_wad,
        loan_price_wad,
    )?;
    require!(!healthy, ParalendError::PositionHealthy);

    // Cannot seize more collateral than position holds
    require!(
        position.collateral >= seized_collateral as u128,
        ParalendError::InsufficientCollateral
    );

    // ── Compute LIF and repaid_assets ─────────────────────────────────────────
    //
    // LIF formula (BPS-scaled):
    //   raw_lif = BPS² / (BPS - LIF_CURSOR * (BPS - lltv) / BPS)
    //   lif = min(MAX_LIF, raw_lif)
    //
    // repaid_assets = seized_collateral * collateral_price / loan_price * BPS / lif
    //   (liquidator pays less than the collateral's full value — the discount is their reward)

    let market = &ctx.accounts.market;
    let lltv = market.lltv as u128;
    let bps = BPS as u128;

    // cursor_factor = LIF_CURSOR * (BPS - lltv) / BPS
    let cursor_factor = mul_div_down(
        LIF_CURSOR as u128,
        bps.saturating_sub(lltv),
        bps,
    )?;

    // denominator = BPS - cursor_factor (must be > 0 for valid lltv < BPS)
    let denom = bps
        .checked_sub(cursor_factor)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    require!(denom > 0, ParalendError::InvalidLltv);

    // raw_lif = BPS² / denom
    let raw_lif = mul_div_up(bps * bps, 1, denom)?;
    let lif = raw_lif.min(MAX_LIF as u128);

    // repaid_assets = seized_collateral * collateral_price / loan_price * BPS / lif
    // Step 1: value_ratio = collateral_price / loan_price (WAD-scaled)
    let value_ratio = mul_div_down(collateral_price_wad, WAD, loan_price_wad)?;
    // Step 2: collateral_value_in_loan = seized_collateral * value_ratio / WAD
    let collateral_value = mul_div_down(seized_collateral as u128, value_ratio, WAD)?;
    // Step 3: repaid = collateral_value * BPS / lif
    let repaid_assets = mul_div_down(collateral_value, bps, lif)?;

    require!(repaid_assets > 0, ParalendError::ZeroAmount);

    // repaid_shares = how many borrow shares correspond to repaid_assets (round DOWN)
    // (fewer shares burned = slight protocol advantage, but can't over-clear)
    let repaid_shares = to_shares_down(
        repaid_assets,
        market.total_borrow_assets,
        market.total_borrow_shares,
    )?;

    // Cap repaid_shares at what the position actually owes
    let position = &ctx.accounts.borrower_position;
    let repaid_shares = repaid_shares.min(position.borrow_shares);

    // Recompute repaid_assets from capped shares (round UP — liquidator pays more if rounded)
    let repaid_assets = to_assets_up(
        repaid_shares,
        market.total_borrow_assets,
        market.total_borrow_shares,
    )?;

    // ── Update market state ───────────────────────────────────────────────────

    let market = &mut ctx.accounts.market;

    market.total_borrow_assets = market
        .total_borrow_assets
        .checked_sub(repaid_assets)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    market.total_borrow_shares = market
        .total_borrow_shares
        .checked_sub(repaid_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // ── Update borrower position ──────────────────────────────────────────────

    let position = &mut ctx.accounts.borrower_position;
    position.collateral = position
        .collateral
        .checked_sub(seized_collateral as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    position.borrow_shares = position
        .borrow_shares
        .checked_sub(repaid_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // ── Bad debt socialization ────────────────────────────────────────────────
    //
    // If collateral = 0 but debt remains (e.g. price gap / oracle delay),
    // the residual debt is irrecoverable. Subtract it from total_supply_assets
    // so that all lenders share the loss proportionally through reduced share value.

    let mut bad_debt_assets: u128 = 0;
    let mut bad_debt_shares: u128 = 0;

    if position.collateral == 0 && position.borrow_shares > 0 {
        bad_debt_shares = position.borrow_shares;
        bad_debt_assets = to_assets_up(
            bad_debt_shares,
            ctx.accounts.market.total_borrow_assets,
            ctx.accounts.market.total_borrow_shares,
        )?;

        let market = &mut ctx.accounts.market;
        // Subtract from supply so remaining lenders absorb the loss
        market.total_supply_assets = market
            .total_supply_assets
            .saturating_sub(bad_debt_assets);
        market.total_borrow_assets = market
            .total_borrow_assets
            .saturating_sub(bad_debt_assets);
        market.total_borrow_shares = market
            .total_borrow_shares
            .saturating_sub(bad_debt_shares);

        let position = &mut ctx.accounts.borrower_position;
        position.borrow_shares = 0;
    }

    let market_id_copy = ctx.accounts.borrower_position.market_id;
    let liquidator_key = ctx.accounts.liquidator.key();
    let borrower_key = ctx.accounts.borrower.key();

    // ── Transfer collateral from vault to liquidator ──────────────────────────

    let bump = ctx.accounts.market.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[SEED_PREFIX, SEED_MARKET, &market_id, &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.liquidator_collateral_ata.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        seized_collateral,
    )?;

    // ── Transfer loan tokens from liquidator to vault (debt repayment) ────────

    let repaid_amount = safe_u128_to_u64(repaid_assets)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.liquidator_loan_ata.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.liquidator.to_account_info(),
            },
        ),
        repaid_amount,
    )?;

    emit!(events::Liquidated {
        market_id: market_id_copy,
        liquidator: liquidator_key,
        borrower: borrower_key,
        repaid_assets,
        repaid_shares,
        seized_collateral: seized_collateral as u128,
        bad_debt_assets,
        bad_debt_shares,
    });

    Ok(())
}
