use anchor_lang::prelude::*;

#[error_code]
pub enum NucleusError {
    // Admin errors (6000-6009)
    #[msg("Unauthorized: caller is not the protocol owner")]
    Unauthorized, // 6000

    #[msg("LLTV value is invalid (must be 0 < lltv < 10000)")]
    InvalidLltv, // 6001

    #[msg("LLTV is already enabled")]
    LltvAlreadyEnabled, // 6002

    #[msg("Maximum number of LLTVs reached")]
    MaxLltvsReached, // 6003

    #[msg("IRM is already enabled")]
    IrmAlreadyEnabled, // 6004

    #[msg("Maximum number of IRMs reached")]
    MaxIrmsReached, // 6005

    #[msg("LLTV is not enabled in protocol state")]
    LltvNotEnabled, // 6006

    #[msg("IRM is not enabled in protocol state")]
    IrmNotEnabled, // 6007

    // Math errors (6010-6019)
    #[msg("Math overflow")]
    MathOverflow, // 6008

    #[msg("Division by zero")]
    DivisionByZero, // 6009

    // Market errors (6020-6029)
    #[msg("Protocol is paused")]
    ProtocolPaused, // 6010

    #[msg("Market is paused")]
    MarketPaused, // 6011

    #[msg("Zero amount not allowed")]
    ZeroAmount, // 6012

    #[msg("Insufficient supply shares")]
    InsufficientShares, // 6013

    #[msg("Insufficient liquidity in market")]
    InsufficientLiquidity, // 6014

    #[msg("Insufficient collateral")]
    InsufficientCollateral, // 6015

    // Position errors (6030-6039)
    #[msg("Position is unhealthy after this operation")]
    PositionUnhealthy, // 6016

    #[msg("Position is healthy and cannot be liquidated")]
    PositionHealthy, // 6017

    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded, // 6018

    // Oracle errors (6040-6049)
    #[msg("Oracle price is stale")]
    OraclePriceStale, // 6019

    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide, // 6020

    #[msg("Oracle price is non-positive")]
    OraclePriceNonPositive, // 6021

    // Input errors (6050-6059)
    #[msg("Invalid input: specify exactly one of assets or shares")]
    InvalidInput, // 6022

    #[msg("Invalid IRM configuration")]
    InvalidIrmConfig, // 6023

    #[msg("Flash loan is locked")]
    FlashLoanLocked, // 6024

    #[msg("Fee exceeds maximum")]
    FeeExceedsMax, // 6025

    #[msg("Oracle feed ID does not match market configuration")]
    OracleFeedMismatch, // 6026

    #[msg("Flash loan caller does not match the starter")]
    FlashLoanCallerMismatch, // 6027

    #[msg("Flash loan repayment amount does not match the borrowed principal")]
    FlashLoanAmountMismatch, // 6028

    #[msg("Position is not empty and cannot be closed")]
    PositionNotEmpty, // 6029
}
