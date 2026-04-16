use crate::errors::ParalendError;
use anchor_lang::prelude::*;

/// Checked addition for u128
pub fn checked_add(a: u128, b: u128) -> Result<u128> {
    a.checked_add(b).ok_or_else(|| error!(ParalendError::MathOverflow))
}

/// Checked subtraction for u128
pub fn checked_sub(a: u128, b: u128) -> Result<u128> {
    a.checked_sub(b).ok_or_else(|| error!(ParalendError::MathOverflow))
}

/// Checked multiplication for u128
pub fn checked_mul(a: u128, b: u128) -> Result<u128> {
    a.checked_mul(b).ok_or_else(|| error!(ParalendError::MathOverflow))
}

/// Checked division for u128
pub fn checked_div(a: u128, b: u128) -> Result<u128> {
    require!(b > 0, ParalendError::DivisionByZero);
    a.checked_div(b).ok_or_else(|| error!(ParalendError::MathOverflow))
}

/// Safe u128 to u64 conversion
pub fn safe_u128_to_u64(val: u128) -> Result<u64> {
    u64::try_from(val).map_err(|_| error!(ParalendError::MathOverflow))
}

/// Minimum of two u128 values
pub fn min_u128(a: u128, b: u128) -> u128 {
    if a < b { a } else { b }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checked_add() {
        assert_eq!(checked_add(1, 2).unwrap(), 3);
        assert_eq!(checked_add(0, 0).unwrap(), 0);
        assert!(checked_add(u128::MAX, 1).is_err());
    }

    #[test]
    fn test_checked_sub() {
        assert_eq!(checked_sub(5, 3).unwrap(), 2);
        assert_eq!(checked_sub(0, 0).unwrap(), 0);
        assert!(checked_sub(0, 1).is_err());
    }

    #[test]
    fn test_checked_mul() {
        assert_eq!(checked_mul(3, 4).unwrap(), 12);
        assert_eq!(checked_mul(0, u128::MAX).unwrap(), 0);
        assert!(checked_mul(u128::MAX, 2).is_err());
    }

    #[test]
    fn test_checked_div() {
        assert_eq!(checked_div(10, 3).unwrap(), 3);
        assert_eq!(checked_div(0, 5).unwrap(), 0);
        assert!(checked_div(1, 0).is_err());
    }

    #[test]
    fn test_safe_u128_to_u64() {
        assert_eq!(safe_u128_to_u64(100).unwrap(), 100);
        assert_eq!(safe_u128_to_u64(u64::MAX as u128).unwrap(), u64::MAX);
        assert!(safe_u128_to_u64(u64::MAX as u128 + 1).is_err());
    }
}
