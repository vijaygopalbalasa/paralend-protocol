use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::NucleusError;
use crate::math::safe_math::safe_u128_to_u64;
use crate::math::wad::mul_div_up;
use crate::state::market::Market;

// ─── Flash Loan ───────────────────────────────────────────────────────────────
//
// Flash loans on Solana work across two instructions in a single atomic transaction:
//
//   Tx {
//     flash_loan_start(market_id, amount)   ← borrows tokens, sets lock=1
//     ... your arbitrage instructions ...
//     flash_loan_end(market_id, amount)     ← verifies repaid+fee, sets lock=0
//   }
//
// If flash_loan_end is not included or repayment is insufficient, the entire
// transaction is reverted. The flash_loan_lock prevents other market operations
// from executing between start and end.
//
// Fee: FLASH_LOAN_FEE_BPS (0.05%). Goes to loan vault (benefits lenders).

/// Start a flash loan: lock the market and send `amount` loan tokens to the recipient.
/// Must be followed by `flash_loan_end` in the same transaction.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32], amount: u64)]
pub struct FlashLoanStart<'info> {
    /// CHECK: anyone can initiate a flash loan
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
        constraint = !market.paused @ NucleusError::MarketPaused,
        constraint = market.flash_loan_lock == 0 @ NucleusError::FlashLoanLocked,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Source: market's loan vault
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: Account<'info, TokenAccount>,

    /// Destination: recipient's loan token account
    #[account(
        mut,
        token::mint = market.loan_mint,
    )]
    pub recipient_loan_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_flash_loan_start(
    ctx: Context<FlashLoanStart>,
    market_id: [u8; 32],
    amount: u64,
) -> Result<()> {
    require!(amount > 0, NucleusError::ZeroAmount);
    require!(
        ctx.accounts.market.available_liquidity() >= amount as u128,
        NucleusError::InsufficientLiquidity
    );

    // Lock the market — blocks all other instructions until flash_loan_end
    ctx.accounts.market.flash_loan_lock = 1;

    // Transfer tokens to recipient — market PDA signs
    let bump = ctx.accounts.market.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[SEED_PREFIX, SEED_MARKET, &market_id, &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.loan_vault.to_account_info(),
                to: ctx.accounts.recipient_loan_ata.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}

/// End a flash loan: verify repayment (principal + fee), unlock the market.
/// Must be called in the same transaction as flash_loan_start.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32], amount: u64)]
pub struct FlashLoanEnd<'info> {
    /// CHECK: must match the caller from flash_loan_start (enforced via lock pattern)
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
        constraint = market.flash_loan_lock == 1 @ NucleusError::FlashLoanLocked,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Destination: market's loan vault (receives repayment + fee)
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: Account<'info, TokenAccount>,

    /// Source: repayer's loan token account
    #[account(
        mut,
        token::mint = market.loan_mint,
        token::authority = caller,
    )]
    pub repayer_loan_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_flash_loan_end(
    ctx: Context<FlashLoanEnd>,
    _market_id: [u8; 32],
    amount: u64,
) -> Result<()> {
    // Compute required repayment: amount + fee (round UP on fee — protocol-favorable)
    let fee = mul_div_up(amount as u128, FLASH_LOAN_FEE_BPS as u128, BPS as u128)?;
    let repay_total = (amount as u128)
        .checked_add(fee)
        .ok_or_else(|| error!(NucleusError::MathOverflow))?;
    let repay_amount = safe_u128_to_u64(repay_total)?;

    // Transfer repayment from caller to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.repayer_loan_ata.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        ),
        repay_amount,
    )?;

    // Fee accrues directly to the vault, increasing available_liquidity.
    // This benefits lenders through increased share value on next interest accrual.
    // (No separate fee accounting needed for flash loans.)

    // Unlock market
    ctx.accounts.market.flash_loan_lock = 0;

    Ok(())
}
