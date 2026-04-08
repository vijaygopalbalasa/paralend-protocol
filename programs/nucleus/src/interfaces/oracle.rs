use crate::constants::{BPS, WAD};
use crate::errors::NucleusError;
use crate::math::shares::to_assets_up;
use crate::math::wad::{mul_div_down, mul_div_up};
use crate::state::market::Market;
use crate::state::oracle::StaticOracle;
use anchor_lang::prelude::*;

/// Read price from a StaticOracle account.
/// Returns price_wad: USD per base unit, WAD-scaled.
/// Validates that the oracle's feed_id matches the expected feed.
pub fn read_static_oracle_price(
    oracle: &Account<StaticOracle>,
    expected_feed_id: &[u8; 32],
) -> Result<u128> {
    require!(
        oracle.feed_id == *expected_feed_id,
        NucleusError::OracleFeedMismatch
    );
    require!(oracle.price_wad > 0, NucleusError::OraclePriceNonPositive);
    Ok(oracle.price_wad)
}

/// Compute the collateral USD value and loan USD value for a position,
/// then check if the position is healthy (collateral * lltv >= debt * BPS).
///
/// Returns `true` if healthy, `false` if unhealthy (liquidatable).
///
/// Price convention: both prices are WAD-scaled USD per base unit.
/// This means callers don't need to worry about token decimals —
/// the oracle price already accounts for them.
pub fn is_position_healthy(
    market: &Market,
    collateral: u128,
    borrow_shares: u128,
    collateral_price_wad: u128,
    loan_price_wad: u128,
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

    // Healthy if: collateral_usd * lltv >= loan_usd * BPS
    let lhs = collateral_usd
        .checked_mul(market.lltv as u128)
        .ok_or_else(|| error!(NucleusError::MathOverflow))?;
    let rhs = loan_usd
        .checked_mul(BPS as u128)
        .ok_or_else(|| error!(NucleusError::MathOverflow))?;

    Ok(lhs >= rhs)
}

/// Get the loan price for a market.
/// If loan_oracle_feed_id is all-zeros (stablecoin), returns $1 per base unit WAD-scaled.
/// Otherwise reads from the provided oracle account and validates the feed_id.
pub fn get_loan_price(
    market: &Market,
    loan_oracle: &Account<StaticOracle>,
) -> Result<u128> {
    if market.loan_oracle_feed_id == [0u8; 32] {
        // Stablecoin: $1 per full token → WAD / 10^decimals per base unit
        let decimals_factor = 10u128
            .checked_pow(market.loan_decimals as u32)
            .ok_or_else(|| error!(NucleusError::MathOverflow))?;
        let price = WAD
            .checked_div(decimals_factor)
            .ok_or_else(|| error!(NucleusError::DivisionByZero))?;
        Ok(price)
    } else {
        read_static_oracle_price(loan_oracle, &market.loan_oracle_feed_id)
    }
}
