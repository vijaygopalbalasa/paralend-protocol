use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::interfaces::oracle::{get_loan_price, is_position_healthy, read_price_cache_stale_ok};
use crate::math::interest::accrue_interest_on_market;
use crate::math::safe_math::safe_u128_to_u64;
use crate::math::shares::{to_assets_up, to_shares_down};
use crate::math::wad::{mul_div_down, mul_div_up};
use crate::state::irm::LinearIrm;
use crate::state::market::Market;
use crate::state::oracle::PriceCache;
use crate::state::position::Position;

// ─── Force Close ─────────────────────────────────────────────────────────────

/// Force-close an unhealthy (by the *time-decayed* LLTV) position within the
/// force-close window `[T_resolution - FORCE_CLOSE_WINDOW_SECONDS,
///                       T_resolution - POST_BORROW_CUTOFF_SECONDS)`.
///
/// Semantics:
///   1. Require the market has a scheduled resolution (`resolution_timestamp > 0`)
///      and we're inside the force-close window.
///   2. Require the position is unhealthy at the current effective LLTV.
///   3. Seize up to all collateral, capped when the remaining debt can be
///      cleared with less collateral at the configured bounty.
///   4. Liquidator pays back `collateral_value_in_loan / (1 + bounty_bps/BPS)`
///      where bounty scales from LIQUIDATOR_BOUNTY_MIN_BPS at window-start
///      to LIQUIDATOR_BOUNTY_MAX_BPS at window-end.
///   5. Any debt left after all collateral is seized is socialized.
///
/// Note: this is the MVP design. Post-hackathon we can add partial seizures,
/// per-liquidator rate limits, and DFlow-CPI redemption.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ForceClosePosition<'info> {
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

    /// Borrower whose position is being force-closed.
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_POSITION, &market_id, borrower.key().as_ref()],
        bump = borrower_position.bump,
        constraint = borrower_position.owner == borrower.key() @ ParalendError::Unauthorized,
        constraint = borrower_position.market_id == market_id @ ParalendError::Unauthorized,
    )]
    pub borrower_position: Box<Account<'info, Position>>,

    /// CHECK: position owner — whose debt is being cleared
    pub borrower: UncheckedAccount<'info>,

    /// Liquidator's loan token account — debt repayment source
    #[account(
        mut,
        token::mint = market.loan_mint,
        token::authority = liquidator,
    )]
    pub liquidator_loan_ata: Box<Account<'info, TokenAccount>>,

    /// Market's loan vault — debt repayment destination
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
        token::mint = market.loan_mint,
        token::authority = market,
    )]
    pub loan_vault: Box<Account<'info, TokenAccount>>,

    /// Market's collateral vault — seized collateral source
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_COLLATERAL_VAULT, &market_id],
        bump = market.collateral_vault_bump,
        token::mint = market.collateral_mint,
        token::authority = market,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    /// Liquidator's collateral token account — seized collateral destination
    #[account(
        mut,
        token::mint = market.collateral_mint,
    )]
    pub liquidator_collateral_ata: Box<Account<'info, TokenAccount>>,

    /// PriceCache for collateral valuation
    #[account(
        seeds = [SEED_PREFIX, SEED_PRICE_CACHE, &market_id],
        bump = price_cache.bump,
    )]
    pub price_cache: Box<Account<'info, PriceCache>>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_force_close_position(
    ctx: Context<ForceClosePosition>,
    market_id: [u8; 32],
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let market_resolution_ts = ctx.accounts.market.resolution_timestamp;
    require!(market_resolution_ts > 0, ParalendError::MarketNotActive);

    // Window = [T_resolution - FORCE_CLOSE_WINDOW, T_resolution).
    // Before T_resolution - FORCE_CLOSE_WINDOW the regular `liquidate` path
    // handles unhealthy positions; at or past T_resolution, handle_resolution
    // marks the market resolved and pauses further position changes.
    let window_open = market_resolution_ts
        .checked_sub(FORCE_CLOSE_WINDOW_SECONDS)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    require!(now >= window_open, ParalendError::ForceCloseWindowClosed);
    require!(now < market_resolution_ts, ParalendError::MarketResolved);

    // Accrue interest so debt computations reflect the present moment.
    accrue_interest_on_market(&mut ctx.accounts.market, &ctx.accounts.irm, now)?;

    // Health check under the time-decayed LLTV. Tolerate a stale oracle
    // here — see `read_price_cache_stale_ok` for the chicken-and-egg
    // reasoning. Inside the 2h window, effective LLTV is already close
    // to zero so price precision doesn't move the healthy/unhealthy
    // boundary much.
    let collateral_price_wad = read_price_cache_stale_ok(
        &ctx.accounts.price_cache,
        &ctx.accounts.market.collateral_oracle_feed_id,
        &market_id,
    )?;
    let loan_price_wad = get_loan_price(&ctx.accounts.market)?;

    let position = &ctx.accounts.borrower_position;
    let healthy = is_position_healthy(
        &ctx.accounts.market,
        position.collateral,
        position.borrow_shares,
        collateral_price_wad,
        loan_price_wad,
    )?;
    require!(!healthy, ParalendError::PositionHealthy);

    let max_seized_collateral = position.collateral;
    require!(
        max_seized_collateral > 0,
        ParalendError::InsufficientCollateral
    );

    // Bounty scales linearly across the force-close window:
    //   bounty_bps = MIN + (MAX - MIN) * (now - window_open) / WINDOW_SECONDS
    let elapsed = now.saturating_sub(window_open);
    let span = LIQUIDATOR_BOUNTY_MAX_BPS.saturating_sub(LIQUIDATOR_BOUNTY_MIN_BPS);
    let bounty_bps = LIQUIDATOR_BOUNTY_MIN_BPS.saturating_add(
        (span as i64).saturating_mul(elapsed).unsigned_abs() / (FORCE_CLOSE_WINDOW_SECONDS as u64),
    );

    // collateral_value_in_loan = seized_collateral * collateral_price / loan_price
    let value_ratio = mul_div_down(collateral_price_wad, WAD, loan_price_wad)?;
    let collateral_value_loan = mul_div_down(max_seized_collateral, value_ratio, WAD)?;

    // repaid_assets = collateral_value / (1 + bounty_bps / BPS)
    //               = collateral_value * BPS / (BPS + bounty_bps)
    let denom = (BPS as u128)
        .checked_add(bounty_bps as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    let market_ro = &ctx.accounts.market;
    let max_repaid_assets = mul_div_down(collateral_value_loan, BPS as u128, denom)?;
    let debt_assets = to_assets_up(
        position.borrow_shares,
        market_ro.total_borrow_assets,
        market_ro.total_borrow_shares,
    )?;
    let target_repaid_assets = max_repaid_assets.min(debt_assets);

    // Cap repaid shares at what the position owes.
    let position = &ctx.accounts.borrower_position;
    let repaid_shares_naive = to_shares_down(
        target_repaid_assets,
        market_ro.total_borrow_assets,
        market_ro.total_borrow_shares,
    )?;
    let repaid_shares = repaid_shares_naive.min(position.borrow_shares);
    require!(repaid_shares > 0, ParalendError::ZeroAmount);
    let repaid_assets = to_assets_up(
        repaid_shares,
        market_ro.total_borrow_assets,
        market_ro.total_borrow_shares,
    )?;
    require!(repaid_assets > 0, ParalendError::ZeroAmount);

    // If the remaining debt caps repayment, seize only the collateral needed
    // to honor the configured bounty. Without this, a near-resolution position
    // with tiny debt could lose all collateral to a liquidator paying only that
    // tiny debt.
    let seized_collateral = if max_repaid_assets >= debt_assets {
        let collateral_value_for_repay = mul_div_up(repaid_assets, denom, BPS as u128)?;
        mul_div_up(collateral_value_for_repay, WAD, value_ratio)?.min(max_seized_collateral)
    } else {
        max_seized_collateral
    };
    require!(seized_collateral > 0, ParalendError::ZeroAmount);

    // ── Apply state updates ──────────────────────────────────────────────────
    let market = &mut ctx.accounts.market;
    market.total_borrow_assets = market
        .total_borrow_assets
        .checked_sub(repaid_assets)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    market.total_borrow_shares = market
        .total_borrow_shares
        .checked_sub(repaid_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    let position = &mut ctx.accounts.borrower_position;
    position.collateral = position
        .collateral
        .checked_sub(seized_collateral)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    position.borrow_shares = position
        .borrow_shares
        .checked_sub(repaid_shares)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Bad-debt socialization if residual debt remains after full seizure.
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
        market.total_supply_assets = market.total_supply_assets.saturating_sub(bad_debt_assets);
        market.total_borrow_assets = market.total_borrow_assets.saturating_sub(bad_debt_assets);
        market.total_borrow_shares = market.total_borrow_shares.saturating_sub(bad_debt_shares);

        let position = &mut ctx.accounts.borrower_position;
        position.borrow_shares = 0;
    }

    // ── Token transfers ──────────────────────────────────────────────────────
    let bump = ctx.accounts.market.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[SEED_PREFIX, SEED_MARKET, &market_id, &[bump]]];

    let seized_amount = safe_u128_to_u64(seized_collateral)?;
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
        seized_amount,
    )?;

    let repaid_amount = safe_u128_to_u64(repaid_assets)?;
    if repaid_amount > 0 {
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
    }

    emit!(events::PositionForceClosed {
        market_id,
        liquidator: ctx.accounts.liquidator.key(),
        borrower: ctx.accounts.borrower.key(),
        seized_collateral,
        repaid_assets,
        repaid_shares,
        bounty_bps,
        bad_debt_assets,
        bad_debt_shares,
    });

    Ok(())
}

// ─── Handle Resolution ────────────────────────────────────────────────────────

/// Called after `resolution_timestamp`. The attester submits the Kalshi
/// outcome bit (1 = YES won, 2 = NO won). The handler flips
/// `market_status = Resolved` and `outcome_bit` accordingly. Source-venue
/// token redemption and position-level settlement are intentionally not handled
/// here yet; this instruction only stops price-based lending activity and
/// records the outcome for consumers.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct HandleResolution<'info> {
    pub attester: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Attester authorization is enforced via the PriceCache: only the
    /// registered attester for this market can finalise resolution.
    #[account(
        seeds = [SEED_PREFIX, SEED_PRICE_CACHE, &market_id],
        bump = price_cache.bump,
        constraint = price_cache.attester == attester.key() @ ParalendError::AttesterNotAuthorized,
    )]
    pub price_cache: Box<Account<'info, PriceCache>>,
}

pub fn handle_resolution(
    ctx: Context<HandleResolution>,
    market_id: [u8; 32],
    outcome_bit: u8,
) -> Result<()> {
    require!(
        outcome_bit == 1 || outcome_bit == 2,
        ParalendError::InvalidOutcome
    );

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;

    require!(
        market.resolution_timestamp > 0,
        ParalendError::MarketNotActive
    );
    require!(
        now >= market.resolution_timestamp,
        ParalendError::ResolutionTooEarly
    );
    require!(market.market_status != 2, ParalendError::MarketResolved);

    market.market_status = 2; // Resolved
    market.outcome_bit = outcome_bit;
    market.paused = true; // Halt further activity pending redemption

    emit!(events::MarketResolved {
        market_id,
        outcome_bit,
        at_timestamp: now,
    });

    Ok(())
}
