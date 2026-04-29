#[cfg(test)]
use crate::constants::SECONDS_PER_YEAR;
use crate::constants::{BPS, MAX_INTEREST_ACCRUAL_SECONDS, WAD};
use crate::errors::ParalendError;
use crate::math::shares::to_shares_down;
use crate::math::wad::{mul_div_down, w_taylor_compounded, wad_mul_down};
use crate::state::irm::LinearIrm;
use crate::state::market::Market;
use anchor_lang::prelude::*;

/// Result of interest accrual computation
pub struct AccrualResult {
    pub interest: u128,
    pub fee_shares: u128,
}

/// Compute the borrow rate per second from the IRM, WAD-scaled
pub fn compute_borrow_rate(irm: &LinearIrm, market: &Market) -> Result<u128> {
    let utilization = compute_utilization(market)?;
    irm.borrow_rate_per_second(utilization)
}

/// Compute utilization ratio, WAD-scaled (0 = 0%, WAD = 100%)
pub fn compute_utilization(market: &Market) -> Result<u128> {
    if market.total_supply_assets == 0 {
        return Ok(0);
    }
    mul_div_down(market.total_borrow_assets, WAD, market.total_supply_assets)
}

/// Accrue interest on a market. Updates market state in place.
/// Returns the interest amount and fee shares minted.
///
/// This should be called at the start of every instruction that reads market state.
pub fn accrue_interest_on_market(
    market: &mut Market,
    irm: &LinearIrm,
    current_timestamp: i64,
) -> Result<AccrualResult> {
    let elapsed = current_timestamp
        .checked_sub(market.last_update)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // No time passed, no interest to accrue
    if elapsed <= 0 || market.total_borrow_assets == 0 {
        market.last_update = current_timestamp;
        return Ok(AccrualResult {
            interest: 0,
            fee_shares: 0,
        });
    }

    // Freeze interest on resolved markets. Otherwise unrecoverable bad
    // debt (losing-side positions with $0 collateral) keeps compounding
    // into `total_supply_assets`, which silently inflates lender share
    // value with phantom USDC the vault does not actually hold — early
    // withdrawers would drain real funds from late withdrawers.
    if market.market_status == 2 {
        market.last_update = current_timestamp;
        return Ok(AccrualResult {
            interest: 0,
            fee_shares: 0,
        });
    }

    // Cap elapsed time to prevent overflow in Taylor expansion
    // After MAX_INTEREST_ACCRUAL_SECONDS, accrue iteratively if needed
    let elapsed_u128 = (elapsed as u128).min(MAX_INTEREST_ACCRUAL_SECONDS);

    // Compute borrow rate per second from IRM
    let borrow_rate_per_second = compute_borrow_rate(irm, market)?;

    // Compute interest using Taylor compound approximation
    let interest_factor = w_taylor_compounded(borrow_rate_per_second, elapsed_u128)?;

    // Interest = total_borrow_assets * interest_factor / WAD
    let interest = wad_mul_down(market.total_borrow_assets, interest_factor)?;

    // Update borrow and supply totals
    market.total_borrow_assets = market
        .total_borrow_assets
        .checked_add(interest)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    market.total_supply_assets = market
        .total_supply_assets
        .checked_add(interest)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    // Compute protocol fee shares
    let mut fee_shares: u128 = 0;
    if market.fee > 0 && interest > 0 {
        // fee_amount = interest * fee / BPS
        let fee_amount = mul_div_down(interest, market.fee as u128, BPS as u128)?;

        if fee_amount > 0 {
            // Convert fee_amount to supply shares
            // After adding interest but before adding fee shares
            fee_shares = to_shares_down(
                fee_amount,
                market
                    .total_supply_assets
                    .checked_sub(fee_amount)
                    .unwrap_or(market.total_supply_assets),
                market.total_supply_shares,
            )?;

            // Add fee shares to total supply shares and pending fee shares
            market.total_supply_shares = market
                .total_supply_shares
                .checked_add(fee_shares)
                .ok_or_else(|| error!(ParalendError::MathOverflow))?;

            market.pending_fee_shares = market
                .pending_fee_shares
                .checked_add(fee_shares)
                .ok_or_else(|| error!(ParalendError::MathOverflow))?;
        }
    }

    market.last_update = current_timestamp;

    Ok(AccrualResult {
        interest,
        fee_shares,
    })
}

/// Compute the supply APY for display purposes (not used on-chain, but useful for SDK)
pub fn compute_supply_rate_per_second(irm: &LinearIrm, market: &Market) -> Result<u128> {
    let utilization = compute_utilization(market)?;
    let borrow_rate = irm.borrow_rate_per_second(utilization)?;

    // supply_rate = borrow_rate * utilization / WAD * (1 - fee / BPS)
    let rate_times_util = wad_mul_down(borrow_rate, utilization)?;
    let fee_factor = (BPS as u128)
        .checked_sub(market.fee as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;
    mul_div_down(rate_times_util, fee_factor, BPS as u128)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_irm() -> LinearIrm {
        LinearIrm {
            bump: 0,
            base_rate: 0,
            slope1: WAD * 5 / 100 / SECONDS_PER_YEAR, // 5% APY slope below kink, per second
            slope2: WAD * 230 / 100 / SECONDS_PER_YEAR, // 230% slope above kink, per second
            kink: WAD * 80 / 100,                     // 80% utilization
            admin: Pubkey::default(),
        }
    }

    fn make_test_market(supply: u128, borrow: u128, fee_bps: u64) -> Market {
        Market {
            bump: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            collateral_oracle_feed_id: [0u8; 32],
            loan_oracle_feed_id: [0u8; 32],
            irm: Pubkey::default(),
            lltv: 8600,
            fee: fee_bps,
            total_supply_assets: supply,
            total_supply_shares: supply * 1_000_000, // 1:1e6 ratio initial
            total_borrow_assets: borrow,
            total_borrow_shares: borrow * 1_000_000,
            pending_fee_shares: 0,
            last_update: 0,
            paused: false,
            market_status: 0,
            outcome_bit: 0,
            resolution_timestamp: 0,
            base_lltv: 8600,
            kalshi_ticker: [0u8; 48],
            reserved: [0u8; 16],
        }
    }

    #[test]
    fn test_utilization_zero_supply() {
        let market = make_test_market(0, 0, 0);
        assert_eq!(compute_utilization(&market).unwrap(), 0);
    }

    #[test]
    fn test_utilization_50pct() {
        let market = make_test_market(1_000_000, 500_000, 0);
        let util = compute_utilization(&market).unwrap();
        // Should be ~50% = 0.5 WAD
        let expected = WAD / 2;
        assert!(util >= expected - 1 && util <= expected + 1);
    }

    #[test]
    fn test_accrue_no_borrows() {
        let irm = make_test_irm();
        let mut market = make_test_market(1_000_000, 0, 1000);
        let result = accrue_interest_on_market(&mut market, &irm, 3600).unwrap();
        assert_eq!(result.interest, 0);
        assert_eq!(result.fee_shares, 0);
    }

    #[test]
    fn test_accrue_one_hour() {
        let irm = make_test_irm();
        let mut market = make_test_market(1_000_000, 500_000, 1000); // 50% util, 10% fee
        let result = accrue_interest_on_market(&mut market, &irm, 3600).unwrap();

        // With 50% utilization, borrow rate ≈ 0 + slope1 * 0.5 = ~2.5% APY
        // Per hour: ~2.5% / 8760 ≈ 0.000285%
        // Interest on 500_000 ≈ 1.4
        assert!(result.interest > 0, "interest should be positive");
        assert!(
            market.total_borrow_assets > 500_000,
            "borrow should increase"
        );
        assert!(
            market.total_supply_assets > 1_000_000,
            "supply should increase by same amount"
        );
    }
}
