use crate::constants::MAX_BINARY_LLTV_BPS;
use crate::errors::ParalendError;
use anchor_lang::prelude::*;

/// Seconds before `resolution_timestamp` at which time-decay begins.
/// Before this point, the effective LLTV equals the base LLTV (capped at
/// `MAX_BINARY_LLTV_BPS`). Within this window, the effective LLTV ramps
/// linearly toward zero. At/past resolution, effective LLTV is zero
/// (the position must be force-closed or settled).
///
/// Chosen at 7 days so the decay is visible on the frontend chart for
/// most Kalshi markets while still giving time-rich borrowers the full
/// base LLTV for the bulk of the event's lifetime.
pub const DECAY_START_SECONDS: i64 = 7 * 24 * 60 * 60; // 604_800

/// Compute the effective LLTV in BPS for a market at a given moment.
///
/// ```text
///   effective_lltv(t) =
///       | base_lltv (capped)                 if resolution_timestamp == 0 (no resolution)
///       | base_lltv (capped)                 if remaining >= DECAY_START_SECONDS
///       | base_lltv * remaining / window     if 0 < remaining < DECAY_START_SECONDS
///       | 0                                   if remaining <= 0
/// ```
///
/// MVP uses a straight linear ramp — simple to reason about, trivial to
/// render on the UI, and deterministic. v2 can swap this for a variance-
/// aware curve (Brownian proxy) without touching callers.
pub fn compute_effective_lltv(
    base_lltv_bps: u64,
    resolution_timestamp: i64,
    now: i64,
) -> Result<u64> {
    // Hard cap for prediction-market collateral: 70 %.
    let capped = base_lltv_bps.min(MAX_BINARY_LLTV_BPS);

    // No scheduled resolution → behave like a classical lending market.
    if resolution_timestamp == 0 {
        return Ok(capped);
    }

    let remaining = resolution_timestamp
        .checked_sub(now)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    if remaining <= 0 {
        // At or past resolution: no leverage permitted until
        // `handle_resolution` marks the market Resolved.
        return Ok(0);
    }
    if remaining >= DECAY_START_SECONDS {
        return Ok(capped);
    }

    // Linear decay: effective = capped * remaining / DECAY_START_SECONDS
    let effective = (capped as u128)
        .checked_mul(remaining as u128)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?
        .checked_div(DECAY_START_SECONDS as u128)
        .ok_or_else(|| error!(ParalendError::DivisionByZero))?;

    Ok(effective as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_resolution_returns_base_capped() {
        // Classical lending market (resolution_timestamp = 0)
        assert_eq!(compute_effective_lltv(6000, 0, 1_000_000).unwrap(), 6000);
        // Base LLTV above cap is clamped
        assert_eq!(
            compute_effective_lltv(9500, 0, 1_000_000).unwrap(),
            MAX_BINARY_LLTV_BPS
        );
    }

    #[test]
    fn far_from_resolution_no_decay() {
        let now = 1_000_000;
        let resolution = now + 14 * 24 * 3600; // 14 days away
        assert_eq!(compute_effective_lltv(6000, resolution, now).unwrap(), 6000);
    }

    #[test]
    fn at_decay_window_boundary_equals_base() {
        let now = 1_000_000;
        let resolution = now + DECAY_START_SECONDS; // exactly 7 days
        assert_eq!(compute_effective_lltv(6000, resolution, now).unwrap(), 6000);
    }

    #[test]
    fn midpoint_of_decay_is_half_base() {
        let now = 1_000_000;
        let resolution = now + DECAY_START_SECONDS / 2;
        assert_eq!(compute_effective_lltv(6000, resolution, now).unwrap(), 3000);
    }

    #[test]
    fn quarter_remaining_is_quarter_base() {
        let now = 1_000_000;
        let resolution = now + DECAY_START_SECONDS / 4;
        assert_eq!(compute_effective_lltv(6000, resolution, now).unwrap(), 1500);
    }

    #[test]
    fn at_resolution_is_zero() {
        let now = 1_000_000;
        assert_eq!(compute_effective_lltv(6000, now, now).unwrap(), 0);
    }

    #[test]
    fn past_resolution_is_zero() {
        let now = 1_000_000;
        assert_eq!(compute_effective_lltv(6000, now - 3600, now).unwrap(), 0);
    }

    #[test]
    fn cap_respected_even_in_decay() {
        let now = 1_000_000;
        let resolution = now + DECAY_START_SECONDS / 2;
        // Base = 9500, capped to 7000, half-life reduction → 3500
        assert_eq!(
            compute_effective_lltv(9500, resolution, now).unwrap(),
            MAX_BINARY_LLTV_BPS / 2
        );
    }

    #[test]
    fn monotone_non_increasing_as_resolution_approaches() {
        // Iterate from far-future resolution down to 0 remaining — as
        // `resolution_timestamp` gets closer to `now`, effective LLTV must
        // never increase.
        let now = 1_000_000;
        let base = 6000;
        let mut prev = u64::MAX;
        let mut t_remaining = DECAY_START_SECONDS;
        while t_remaining >= 0 {
            let resolution = now + t_remaining;
            let eff = compute_effective_lltv(base, resolution, now).unwrap();
            assert!(
                eff <= prev,
                "effective LLTV should be non-increasing as resolution nears: {} > {}",
                eff,
                prev
            );
            prev = eff;
            t_remaining -= 3600;
        }
    }
}
