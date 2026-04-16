use crate::constants::{BPS, MAX_ORACLE_AGE, WAD};
use crate::errors::ParalendError;
use crate::math::shares::to_assets_up;
use crate::math::wad::{mul_div_down, mul_div_up};
use crate::state::market::Market;
use crate::state::oracle::PriceCache;
use anchor_lang::prelude::*;

/// Read collateral price from the market's PriceCache.
/// Enforces feed_id binding + staleness check against `MAX_ORACLE_AGE`.
///
/// Returns `price_wad`: USD per base unit, WAD-scaled.
pub fn read_price_cache(
    cache: &Account<PriceCache>,
    expected_feed_id: &[u8; 32],
    expected_market_id: &[u8; 32],
) -> Result<u128> {
    require!(
        cache.market_id == *expected_market_id,
        ParalendError::OracleFeedMismatch
    );
    require!(
        cache.feed_id == *expected_feed_id,
        ParalendError::OracleFeedMismatch
    );
    require!(
        cache.ema_price_wad > 0,
        ParalendError::OraclePriceNonPositive
    );
    require!(
        cache.last_update_ts > 0,
        ParalendError::OraclePriceStale
    );

    // Staleness: reject reads older than MAX_ORACLE_AGE seconds.
    let now = Clock::get()?.unix_timestamp;
    let age = now
        .checked_sub(cache.last_update_ts)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    require!(age >= 0, ParalendError::OraclePriceStale);
    require!(
        (age as u64) <= MAX_ORACLE_AGE,
        ParalendError::OraclePriceStale
    );

    Ok(cache.ema_price_wad)
}

/// Compute whether a position is healthy using the *base* LLTV stored on
/// the market. Callers that need the time-decayed effective LLTV should
/// use `is_position_healthy_effective` instead (coming in `math/decay.rs`).
///
/// Price convention: both prices are WAD-scaled USD per base unit.
/// Callers don't need to worry about token decimals — the oracle price
/// already accounts for them.
pub fn is_position_healthy(
    market: &Market,
    collateral: u128,
    borrow_shares: u128,
    collateral_price_wad: u128,
    loan_price_wad: u128,
) -> Result<bool> {
    is_position_healthy_at_lltv(
        market,
        collateral,
        borrow_shares,
        collateral_price_wad,
        loan_price_wad,
        market.lltv as u128,
    )
}

/// Health check parameterised by the effective LLTV in BPS.
/// Used by the time-decay resolution logic to pass a tightened LLTV.
pub fn is_position_healthy_at_lltv(
    market: &Market,
    collateral: u128,
    borrow_shares: u128,
    collateral_price_wad: u128,
    loan_price_wad: u128,
    effective_lltv_bps: u128,
) -> Result<bool> {
    if borrow_shares == 0 {
        return Ok(true);
    }

    // Convert borrow shares → assets (round up: use worst-case debt)
    let borrow_assets = to_assets_up(
        borrow_shares,
        market.total_borrow_assets,
        market.total_borrow_shares,
    )?;

    if borrow_assets == 0 {
        return Ok(true);
    }

    // USD values (WAD cancelled): collateral_usd = collateral * price / WAD
    let collateral_usd = mul_div_down(collateral, collateral_price_wad, WAD)?;
    let loan_usd = mul_div_up(borrow_assets, loan_price_wad, WAD)?;

    if loan_usd == 0 {
        return Ok(true);
    }

    // Healthy if: collateral_usd * lltv_bps >= loan_usd * BPS
    let lhs = collateral_usd
        .checked_mul(effective_lltv_bps)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    let rhs = loan_usd
        .checked_mul(BPS as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    Ok(lhs >= rhs)
}

/// Get the loan price for a market.
/// For Paralend the loan side is USDC only — MVP hardcodes $1 per whole
/// token and derives per-base-unit WAD-scaled price from loan decimals.
/// The `loan_oracle_feed_id` field on Market is kept for v2 when non-USDC
/// loan assets might be added (it's expected to be all-zeros today).
pub fn get_loan_price(market: &Market) -> Result<u128> {
    let decimals_factor = 10u128
        .checked_pow(market.loan_decimals as u32)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    let price = WAD
        .checked_div(decimals_factor)
        .ok_or_else(|| error!(ParalendError::DivisionByZero))?;
    Ok(price)
}
