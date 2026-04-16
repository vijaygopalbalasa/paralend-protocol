use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod interfaces;
pub mod math;
pub mod state;

use instructions::admin::*;
use instructions::borrow::*;
use instructions::collateral::*;
use instructions::flash_loan::*;
use instructions::liquidate::*;
use instructions::market::*;
use instructions::position::*;
use instructions::supply::*;
use instructions::utils::*;

declare_id!("2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8");

#[program]
pub mod paralend {
    use super::*;

    // ─── Admin ───────────────────────────────────────────────

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        owner: Pubkey,
        fee_recipient: Pubkey,
    ) -> Result<()> {
        instructions::admin::handle_initialize_protocol(ctx, owner, fee_recipient)
    }

    pub fn enable_lltv(ctx: Context<EnableLltv>, lltv: u64) -> Result<()> {
        instructions::admin::handle_enable_lltv(ctx, lltv)
    }

    pub fn enable_irm(ctx: Context<EnableIrm>, irm: Pubkey) -> Result<()> {
        instructions::admin::handle_enable_irm(ctx, irm)
    }

    pub fn create_static_oracle(
        ctx: Context<CreateStaticOracle>,
        feed_id: [u8; 32],
        initial_price_wad: u128,
    ) -> Result<()> {
        instructions::admin::handle_create_static_oracle(ctx, feed_id, initial_price_wad)
    }

    pub fn set_static_oracle_price(
        ctx: Context<SetStaticOraclePrice>,
        new_price_wad: u128,
    ) -> Result<()> {
        instructions::admin::handle_set_static_oracle_price(ctx, new_price_wad)
    }

    pub fn set_fee(ctx: Context<SetFee>, market_id: [u8; 32], fee: u64) -> Result<()> {
        instructions::admin::handle_set_fee(ctx, market_id, fee)
    }

    // ─── Market ──────────────────────────────────────────────

    pub fn create_irm(
        ctx: Context<CreateIrm>,
        base_rate: u128,
        slope1: u128,
        slope2: u128,
        kink: u128,
        nonce: u64,
    ) -> Result<()> {
        instructions::market::handle_create_irm(ctx, base_rate, slope1, slope2, kink, nonce)
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: [u8; 32],
        collateral_oracle_feed_id: [u8; 32],
        loan_oracle_feed_id: [u8; 32],
        irm_key: Pubkey,
        lltv: u64,
        fee: u64,
    ) -> Result<()> {
        instructions::market::handle_create_market(
            ctx,
            market_id,
            collateral_oracle_feed_id,
            loan_oracle_feed_id,
            irm_key,
            lltv,
            fee,
        )
    }

    // ─── Position ────────────────────────────────────────────

    pub fn create_position(ctx: Context<CreatePosition>, market_id: [u8; 32]) -> Result<()> {
        instructions::position::handle_create_position(ctx, market_id)
    }

    pub fn close_position(ctx: Context<ClosePosition>, market_id: [u8; 32]) -> Result<()> {
        instructions::position::handle_close_position(ctx, market_id)
    }

    // ─── Supply / Withdraw (lender) ─────────────────────────

    pub fn supply(
        ctx: Context<Supply>,
        market_id: [u8; 32],
        assets: u64,
        min_shares: u128,
    ) -> Result<()> {
        instructions::supply::handle_supply(ctx, market_id, assets, min_shares)
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        market_id: [u8; 32],
        assets: u64,
        shares: u128,
        max_shares_burn: u128,
        min_assets_out: u128,
    ) -> Result<()> {
        instructions::supply::handle_withdraw(ctx, market_id, assets, shares, max_shares_burn, min_assets_out)
    }

    // ─── Accrue Interest (permissionless crank) ──────────────

    pub fn accrue_interest(
        ctx: Context<AccrueInterest>,
        market_id: [u8; 32],
    ) -> Result<()> {
        instructions::utils::handle_accrue_interest(ctx, market_id)
    }

    // ─── Claim Fees ─────────────────────────────────────────

    pub fn claim_fees(ctx: Context<ClaimFees>, market_id: [u8; 32]) -> Result<()> {
        instructions::utils::handle_claim_fees(ctx, market_id)
    }

    // ─── Collateral ─────────────────────────────────────────

    pub fn supply_collateral(
        ctx: Context<SupplyCollateral>,
        market_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::collateral::handle_supply_collateral(ctx, market_id, amount)
    }

    pub fn withdraw_collateral(
        ctx: Context<WithdrawCollateral>,
        market_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::collateral::handle_withdraw_collateral(ctx, market_id, amount)
    }

    // ─── Borrow / Repay ─────────────────────────────────────

    pub fn borrow(
        ctx: Context<Borrow>,
        market_id: [u8; 32],
        assets: u64,
        max_shares: u128,
    ) -> Result<()> {
        instructions::borrow::handle_borrow(ctx, market_id, assets, max_shares)
    }

    pub fn repay(
        ctx: Context<Repay>,
        market_id: [u8; 32],
        assets: u64,
        shares: u128,
    ) -> Result<()> {
        instructions::borrow::handle_repay(ctx, market_id, assets, shares)
    }

    // ─── Flash Loans ────────────────────────────────────────

    pub fn flash_loan_start(
        ctx: Context<FlashLoanStart>,
        market_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::flash_loan::handle_flash_loan_start(ctx, market_id, amount)
    }

    pub fn flash_loan_end(
        ctx: Context<FlashLoanEnd>,
        market_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::flash_loan::handle_flash_loan_end(ctx, market_id, amount)
    }

    // ─── Liquidate ──────────────────────────────────────────

    pub fn liquidate(
        ctx: Context<Liquidate>,
        market_id: [u8; 32],
        seized_collateral: u64,
    ) -> Result<()> {
        instructions::liquidate::handle_liquidate(ctx, market_id, seized_collateral)
    }
}
