use crate::constants::{VIRTUAL_ASSETS, VIRTUAL_SHARES};
use crate::math::wad::{mul_div_down, mul_div_up};
use anchor_lang::prelude::*;

/// Convert assets to shares, rounding down (favors protocol on deposits)
/// Used for: supply (lender deposits), liquidation repayment calculation
pub fn to_shares_down(assets: u128, total_assets: u128, total_shares: u128) -> Result<u128> {
    mul_div_down(
        assets,
        total_shares + VIRTUAL_SHARES,
        total_assets + VIRTUAL_ASSETS,
    )
}

/// Convert assets to shares, rounding up (favors protocol on borrows)
/// Used for: borrow (borrower takes debt)
pub fn to_shares_up(assets: u128, total_assets: u128, total_shares: u128) -> Result<u128> {
    mul_div_up(
        assets,
        total_shares + VIRTUAL_SHARES,
        total_assets + VIRTUAL_ASSETS,
    )
}

/// Convert shares to assets, rounding down (favors protocol on withdrawals)
/// Used for: withdraw (lender redeems), liquidation repayment
pub fn to_assets_down(shares: u128, total_assets: u128, total_shares: u128) -> Result<u128> {
    mul_div_down(
        shares,
        total_assets + VIRTUAL_ASSETS,
        total_shares + VIRTUAL_SHARES,
    )
}

/// Convert shares to assets, rounding up (favors protocol on repayments)
/// Used for: repay (borrower pays debt)
pub fn to_assets_up(shares: u128, total_assets: u128, total_shares: u128) -> Result<u128> {
    mul_div_up(
        shares,
        total_assets + VIRTUAL_ASSETS,
        total_shares + VIRTUAL_SHARES,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_first_deposit() {
        // First depositor: 1000 assets with 0 existing
        let shares = to_shares_down(1000, 0, 0).unwrap();
        // shares = 1000 * (0 + 1e6) / (0 + 1) = 1_000_000_000
        assert_eq!(shares, 1_000_000_000);
    }

    #[test]
    fn test_second_deposit_proportional() {
        // After first deposit: total_assets=1000, total_shares=1_000_000_000
        let shares = to_shares_down(1000, 1000, 1_000_000_000).unwrap();
        // shares = 1000 * (1e9 + 1e6) / (1000 + 1) = 1000 * 1_001_000_000 / 1001
        // ≈ 1_000_000_000 (approximately same as first)
        assert!(shares > 999_000_000 && shares < 1_001_000_000);
    }

    #[test]
    fn test_interest_accrual_increases_value() {
        // Initial: 1000 assets, 1_000_000_000 shares
        // After interest: 1100 assets (10% interest), same shares
        let assets = to_assets_down(1_000_000_000, 1100, 1_000_000_000).unwrap();
        // Should be approximately 1100 (each share is worth more now)
        assert!(assets >= 1099 && assets <= 1101);
    }

    #[test]
    fn test_rounding_direction_supply() {
        // Supply rounding: shares should round DOWN (fewer shares for supplier)
        let shares = to_shares_down(1, 3, 3_000_000).unwrap();
        let shares_up = to_shares_up(1, 3, 3_000_000).unwrap();
        assert!(shares <= shares_up);
    }

    #[test]
    fn test_rounding_direction_borrow() {
        // Borrow rounding: shares should round UP (more debt for borrower)
        let shares_down = to_shares_down(100, 1000, 1_000_000_000).unwrap();
        let shares_up = to_shares_up(100, 1000, 1_000_000_000).unwrap();
        assert!(shares_up >= shares_down);
    }

    #[test]
    fn test_dust_amount() {
        // Depositing 1 wei with large existing pool
        let shares = to_shares_down(1, 1_000_000, 1_000_000_000_000).unwrap();
        // Should get some shares (not zero) due to virtual offset
        assert!(shares > 0);
    }

    #[test]
    fn test_zero_deposit() {
        let shares = to_shares_down(0, 1000, 1_000_000_000).unwrap();
        assert_eq!(shares, 0);
    }

    #[test]
    fn test_roundtrip_approximate() {
        // Deposit and immediately withdraw should return ~same amount
        let total_assets: u128 = 1_000_000;
        let total_shares: u128 = 1_000_000_000_000;
        let deposit = 5000_u128;

        let shares = to_shares_down(deposit, total_assets, total_shares).unwrap();
        let withdrawn = to_assets_down(shares, total_assets + deposit, total_shares + shares).unwrap();

        // Should get back deposit amount minus at most 1 (rounding)
        assert!(withdrawn >= deposit - 1 && withdrawn <= deposit);
    }
}
