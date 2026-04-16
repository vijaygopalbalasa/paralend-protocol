use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::state::irm::LinearIrm;
use crate::state::market::{compute_market_id, Market};
use crate::state::protocol::ProtocolState;

/// Create a new IRM configuration
#[derive(Accounts)]
#[instruction(base_rate: u128, slope1: u128, slope2: u128, kink: u128, nonce: u64)]
pub struct CreateIrm<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = LinearIrm::SPACE,
        seeds = [SEED_PREFIX, SEED_LINEAR_IRM, payer.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub irm: Account<'info, LinearIrm>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_irm(
    ctx: Context<CreateIrm>,
    base_rate: u128,
    slope1: u128,
    slope2: u128,
    kink: u128,
    _nonce: u64,
) -> Result<()> {
    require!(kink <= WAD, ParalendError::InvalidIrmConfig);

    let irm = &mut ctx.accounts.irm;
    irm.bump = ctx.bumps.irm;
    irm.base_rate = base_rate;
    irm.slope1 = slope1;
    irm.slope2 = slope2;
    irm.kink = kink;
    irm.admin = ctx.accounts.payer.key();

    Ok(())
}

/// Create a new isolated lending market
///
/// `market_id` is passed explicitly (computed by the client as
/// keccak256(collateral_mint, loan_mint, oracle_feeds, irm, lltv)).
/// The handler verifies it matches — this avoids computing the hash
/// 3× in seeds constraints which overflows the BPF stack.
#[derive(Accounts)]
#[instruction(
    market_id: [u8; 32],
    collateral_oracle_feed_id: [u8; 32],
    loan_oracle_feed_id: [u8; 32],
    irm_key: Pubkey,
    lltv: u64,
    fee: u64
)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    pub collateral_mint: Box<Account<'info, Mint>>,
    pub loan_mint: Box<Account<'info, Mint>>,

    #[account(
        constraint = irm_account.key() == irm_key @ ParalendError::IrmNotEnabled,
    )]
    pub irm_account: Box<Account<'info, LinearIrm>>,

    #[account(
        init,
        payer = payer,
        space = Market::SPACE,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init,
        payer = payer,
        token::mint = collateral_mint,
        token::authority = market,
        seeds = [SEED_PREFIX, SEED_COLLATERAL_VAULT, &market_id],
        bump,
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        token::mint = loan_mint,
        token::authority = market,
        seeds = [SEED_PREFIX, SEED_LOAN_VAULT, &market_id],
        bump,
    )]
    pub loan_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_market(
    ctx: Context<CreateMarket>,
    market_id: [u8; 32],
    collateral_oracle_feed_id: [u8; 32],
    loan_oracle_feed_id: [u8; 32],
    irm_key: Pubkey,
    lltv: u64,
    fee: u64,
) -> Result<()> {
    require!(lltv > 0 && lltv < BPS, ParalendError::InvalidLltv);

    // Verify fee is within bounds
    require!(fee <= MAX_FEE_BPS, ParalendError::FeeExceedsMax);

    // Verify LLTV and IRM are enabled in protocol state
    require!(
        ctx.accounts.protocol_state.is_lltv_enabled(lltv),
        ParalendError::LltvNotEnabled
    );
    require!(
        ctx.accounts.protocol_state.is_irm_enabled(&irm_key),
        ParalendError::IrmNotEnabled
    );

    // Verify the client-supplied market_id matches what we'd compute
    let expected_market_id = compute_market_id(
        &ctx.accounts.collateral_mint.key(),
        &ctx.accounts.loan_mint.key(),
        &collateral_oracle_feed_id,
        &loan_oracle_feed_id,
        &irm_key,
        lltv,
    );
    require!(market_id == expected_market_id, ParalendError::Unauthorized);

    let market = &mut ctx.accounts.market;
    market.bump = ctx.bumps.market;
    market.collateral_vault_bump = ctx.bumps.collateral_vault;
    market.loan_vault_bump = ctx.bumps.loan_vault;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.loan_mint = ctx.accounts.loan_mint.key();
    market.collateral_decimals = ctx.accounts.collateral_mint.decimals;
    market.loan_decimals = ctx.accounts.loan_mint.decimals;
    market.collateral_oracle_feed_id = collateral_oracle_feed_id;
    market.loan_oracle_feed_id = loan_oracle_feed_id;
    market.irm = irm_key;
    market.lltv = lltv;
    market.fee = fee;
    market.total_supply_assets = 0;
    market.total_supply_shares = 0;
    market.total_borrow_assets = 0;
    market.total_borrow_shares = 0;
    market.pending_fee_shares = 0;
    market.last_update = Clock::get()?.unix_timestamp;
    market.paused = false;
    market.flash_loan_lock = 0;
    market.flash_loan_amount = 0;
    market.flash_loan_caller = Pubkey::default();
    market.reserved = [0u8; 24];

    // Increment market count
    let protocol_state = &mut ctx.accounts.protocol_state;
    protocol_state.market_count = protocol_state
        .market_count
        .checked_add(1)
        .ok_or_else(|| error!(ParalendError::MathOverflow))?;

    emit!(events::MarketCreated {
        market_id,
        collateral_mint: ctx.accounts.collateral_mint.key(),
        loan_mint: ctx.accounts.loan_mint.key(),
        irm: irm_key,
        lltv,
    });

    Ok(())
}
