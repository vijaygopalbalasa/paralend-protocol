use crate::constants::WAD;
use crate::errors::ParalendError;
use anchor_lang::prelude::*;

/// Multiply two values and divide by a third, rounding down
/// result = (a * b) / c, rounded toward zero
pub fn mul_div_down(a: u128, b: u128, c: u128) -> Result<u128> {
    require!(c > 0, ParalendError::DivisionByZero);
    // Use u128 directly — max product is u64::MAX * u64::MAX which fits in u128
    // For larger values, we need to be careful about overflow
    // Split into high/low multiplication if needed
    let product = a.checked_mul(b).ok_or_else(|| error!(ParalendError::MathOverflow))?;
    Ok(product / c)
}

/// Multiply two values and divide by a third, rounding up
/// result = ceil(a * b / c)
pub fn mul_div_up(a: u128, b: u128, c: u128) -> Result<u128> {
    require!(c > 0, ParalendError::DivisionByZero);
    let product = a.checked_mul(b).ok_or_else(|| error!(ParalendError::MathOverflow))?;
    // (product + c - 1) / c = ceil(product / c)
    let result = product
        .checked_add(c - 1)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?
        / c;
    Ok(result)
}

/// WAD-scaled multiplication, rounding down: (a * b) / WAD
pub fn wad_mul_down(a: u128, b: u128) -> Result<u128> {
    mul_div_down(a, b, WAD)
}

/// WAD-scaled multiplication, rounding up: ceil(a * b / WAD)
pub fn wad_mul_up(a: u128, b: u128) -> Result<u128> {
    mul_div_up(a, b, WAD)
}

/// Taylor series approximation for compound interest
/// Computes: e^(rate * time) - 1, WAD-scaled
///
/// Uses 3rd-order Taylor expansion:
///   x + x^2/2 + x^3/6
/// where x = rate_per_second * elapsed_seconds
///
/// Accurate to <0.01% for typical accrual intervals (seconds to hours)
pub fn w_taylor_compounded(rate_per_second: u128, elapsed: u128) -> Result<u128> {
    let x = rate_per_second
        .checked_mul(elapsed)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    if x == 0 {
        return Ok(0);
    }

    // First term: x
    let first_term = x;

    // Second term: x^2 / (2 * WAD)
    let x_squared = mul_div_down(x, x, WAD)?;
    let second_term = x_squared / 2;

    // Third term: x^3 / (6 * WAD^2) = (x^2 / WAD) * x / (6 * WAD)
    let third_term = mul_div_down(x_squared, x, WAD.checked_mul(6).unwrap())?;

    first_term
        .checked_add(second_term)
        .and_then(|v| v.checked_add(third_term))
        .ok_or_else(|| error!(ParalendError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mul_div_down() {
        assert_eq!(mul_div_down(10, 3, 4).unwrap(), 7); // 30/4 = 7.5, rounds to 7
        assert_eq!(mul_div_down(100, WAD, WAD).unwrap(), 100);
        assert_eq!(mul_div_down(0, 100, 1).unwrap(), 0);
    }

    #[test]
    fn test_mul_div_up() {
        assert_eq!(mul_div_up(10, 3, 4).unwrap(), 8); // 30/4 = 7.5, rounds to 8
        assert_eq!(mul_div_up(100, WAD, WAD).unwrap(), 100);
        assert_eq!(mul_div_up(1, 1, 3).unwrap(), 1); // 1/3 rounds up to 1
    }

    #[test]
    fn test_wad_mul_down() {
        // 2 WAD * 0.5 WAD = 1 WAD
        let half_wad = WAD / 2;
        let two_wad = WAD * 2;
        assert_eq!(wad_mul_down(two_wad, half_wad).unwrap(), WAD);
    }

    #[test]
    fn test_w_taylor_compounded_zero() {
        assert_eq!(w_taylor_compounded(0, 100).unwrap(), 0);
        assert_eq!(w_taylor_compounded(100, 0).unwrap(), 0);
    }

    #[test]
    fn test_w_taylor_compounded_small_rate() {
        // 5% APY = 0.05 / 31536000 per second in WAD
        let rate_per_second = WAD * 5 / 100 / 31_536_000; // ~1_585_489_599
        let one_hour = 3600_u128;
        let factor = w_taylor_compounded(rate_per_second, one_hour).unwrap();

        // Expected: ~0.0000057% per hour for 5% APY
        // factor should be small but positive
        assert!(factor > 0);
        assert!(factor < WAD / 1000); // Less than 0.1% per hour
    }

    #[test]
    fn test_w_taylor_compounded_one_year_5pct() {
        // 5% APY → rate per second
        let rate_per_second = WAD * 5 / 100 / 31_536_000;
        let one_year = 31_536_000_u128;
        let factor = w_taylor_compounded(rate_per_second, one_year).unwrap();

        // Should be approximately 5% = 0.05 WAD = 50_000_000_000_000_000
        let five_pct_wad = WAD * 5 / 100;
        // Allow 3% relative error (Taylor 3rd-order approx over full year)
        // In practice, interest accrues every few seconds/minutes, not yearly,
        // so actual error is <0.01%
        let lower = five_pct_wad * 97 / 100;
        let upper = five_pct_wad * 103 / 100;
        assert!(factor >= lower && factor <= upper, "factor={} expected ~{}", factor, five_pct_wad);
    }
}
