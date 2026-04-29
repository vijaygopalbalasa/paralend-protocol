use crate::constants::{SECONDS_PER_YEAR, WAD};
use crate::errors::ParalendError;
use crate::math::wad::wad_mul_down;
use anchor_lang::prelude::*;

/// Linear kinked interest rate model
/// Below kink: rate = base_rate + slope1 * utilization / WAD
/// Above kink: rate = base_rate + slope1 * kink / WAD + slope2 * (utilization - kink) / WAD
///
/// All rates are stored as per-second rates, WAD-scaled.
#[account]
pub struct LinearIrm {
    /// PDA bump seed
    pub bump: u8,

    /// Base rate per second (WAD-scaled). Usually 0.
    pub base_rate: u128,

    /// Slope of the rate curve below the kink, per second, WAD-scaled
    /// Example: for 5% APY slope → 5 * WAD / 100 / SECONDS_PER_YEAR
    pub slope1: u128,

    /// Slope of the rate curve above the kink, per second, WAD-scaled
    pub slope2: u128,

    /// Utilization kink point (WAD-scaled, e.g., 0.8 WAD = 80%)
    pub kink: u128,

    /// Creator of this IRM
    pub admin: Pubkey,
}

impl LinearIrm {
    pub const SPACE: usize = 8 // discriminator
        + 1  // bump
        + 16 // base_rate
        + 16 // slope1
        + 16 // slope2
        + 16 // kink
        + 32; // admin

    /// Compute the borrow rate per second given the current utilization (WAD-scaled)
    pub fn borrow_rate_per_second(&self, utilization: u128) -> Result<u128> {
        if utilization <= self.kink {
            // Below kink: base_rate + slope1 * utilization / WAD
            let variable = wad_mul_down(self.slope1, utilization)?;
            self.base_rate
                .checked_add(variable)
                .ok_or_else(|| error!(ParalendError::MathOverflow))
        } else {
            // Above kink: base_rate + slope1 * kink / WAD + slope2 * (utilization - kink) / WAD
            let below_kink = wad_mul_down(self.slope1, self.kink)?;
            let above_kink = wad_mul_down(
                self.slope2,
                utilization
                    .checked_sub(self.kink)
                    .ok_or_else(|| error!(ParalendError::MathOverflow))?,
            )?;
            self.base_rate
                .checked_add(below_kink)
                .and_then(|v| v.checked_add(above_kink))
                .ok_or_else(|| error!(ParalendError::MathOverflow))
        }
    }

    /// Compute the annualized borrow rate for display (APY as a WAD-scaled value)
    pub fn borrow_rate_apy(&self, utilization: u128) -> Result<u128> {
        let per_second = self.borrow_rate_per_second(utilization)?;
        per_second
            .checked_mul(SECONDS_PER_YEAR)
            .ok_or_else(|| error!(ParalendError::MathOverflow))
    }

    /// Create default IRM parameters for prediction-market lending pools
    /// 0% base, 5% APY slope1, 230% APY slope2, 80% kink
    pub fn default_params() -> (u128, u128, u128, u128) {
        let base = 0_u128;
        let slope1 = WAD * 5 / 100 / SECONDS_PER_YEAR;
        let slope2 = WAD * 230 / 100 / SECONDS_PER_YEAR;
        let kink = WAD * 80 / 100;
        (base, slope1, slope2, kink)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_default_irm() -> LinearIrm {
        let (base, s1, s2, k) = LinearIrm::default_params();
        LinearIrm {
            bump: 0,
            base_rate: base,
            slope1: s1,
            slope2: s2,
            kink: k,
            admin: Pubkey::default(),
        }
    }

    #[test]
    fn test_rate_at_zero_utilization() {
        let irm = make_default_irm();
        let rate = irm.borrow_rate_per_second(0).unwrap();
        assert_eq!(rate, 0); // 0% at 0 utilization
    }

    #[test]
    fn test_rate_at_kink() {
        let irm = make_default_irm();
        let rate = irm.borrow_rate_per_second(WAD * 80 / 100).unwrap();
        let apy = rate * SECONDS_PER_YEAR;
        // Should be ~4% APY = 0.04 WAD
        let expected = WAD * 4 / 100;
        let tolerance = expected / 100; // 1% relative tolerance
        assert!(
            apy >= expected - tolerance && apy <= expected + tolerance,
            "APY at kink: {} expected ~{}",
            apy,
            expected
        );
    }

    #[test]
    fn test_rate_at_100pct() {
        let irm = make_default_irm();
        let rate = irm.borrow_rate_per_second(WAD).unwrap();
        let apy = rate * SECONDS_PER_YEAR;
        // Should be ~4% + 230% * 20% = 4% + 46% = 50% APY
        let expected = WAD * 50 / 100;
        let tolerance = expected / 50; // 2% relative tolerance
        assert!(
            apy >= expected - tolerance && apy <= expected + tolerance,
            "APY at 100%: {} expected ~{}",
            apy,
            expected
        );
    }

    #[test]
    fn test_rate_above_kink_is_steeper() {
        let irm = make_default_irm();
        let rate_79 = irm.borrow_rate_per_second(WAD * 79 / 100).unwrap();
        let rate_81 = irm.borrow_rate_per_second(WAD * 81 / 100).unwrap();
        let diff = rate_81 - rate_79;
        // 2% utilization change across kink should show steeper jump
        let rate_49 = irm.borrow_rate_per_second(WAD * 49 / 100).unwrap();
        let rate_51 = irm.borrow_rate_per_second(WAD * 51 / 100).unwrap();
        let diff_below = rate_51 - rate_49;
        assert!(diff > diff_below, "Rate should be steeper above kink");
    }
}
