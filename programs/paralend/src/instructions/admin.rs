use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::state::oracle::StaticOracle;
use crate::state::protocol::ProtocolState;

/// Initialize the protocol singleton.
/// The `payer` must equal the desired `owner`. This prevents a front-run
/// where an attacker races the deployer's init tx and hijacks permanent
/// protocol ownership.
#[derive(Accounts)]
#[instruction(owner: Pubkey, _fee_recipient: Pubkey)]
pub struct InitializeProtocol<'info> {
    /// Payer must match the owner argument (enforced in handler).
    #[account(mut, constraint = payer.key() == owner @ ParalendError::Unauthorized)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = ProtocolState::SPACE,
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_protocol(
    ctx: Context<InitializeProtocol>,
    owner: Pubkey,
    fee_recipient: Pubkey,
) -> Result<()> {
    // Defensive: account constraint already enforces this, but the handler
    // asserts invariant so any constraint change can't silently break it.
    require_keys_eq!(
        ctx.accounts.payer.key(),
        owner,
        ParalendError::Unauthorized
    );

    let state = &mut ctx.accounts.protocol_state;
    state.bump = ctx.bumps.protocol_state;
    state.owner = owner;
    state.pending_owner = Pubkey::default();
    state.fee_recipient = fee_recipient;
    state.paused = false;
    state.lltv_count = 0;
    state.enabled_lltvs = [0u64; MAX_LLTVS];
    state.irm_count = 0;
    state.enabled_irms = [Pubkey::default(); MAX_IRMS];
    state.market_count = 0;
    state.reserved = [0u8; 256];

    emit!(events::ProtocolInitialized {
        owner,
        fee_recipient,
    });

    Ok(())
}

// ─── Two-step ownership transfer ─────────────────────────────────────────────

/// Current owner proposes a new owner. Does not change ownership; only sets
/// `pending_owner`. The new owner must call `accept_ownership` to finalize.
/// Passing `new_owner = Pubkey::default()` cancels any pending transfer.
#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ ParalendError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn handle_transfer_ownership(
    ctx: Context<TransferOwnership>,
    new_owner: Pubkey,
) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    state.pending_owner = new_owner;

    emit!(events::OwnershipTransferInitiated {
        old_owner: state.owner,
        pending_owner: new_owner,
    });

    Ok(())
}

/// Pending owner accepts the transfer. Swaps `owner` and clears `pending_owner`.
#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    pub pending_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.pending_owner == pending_owner.key() @ ParalendError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn handle_accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    let old_owner = state.owner;
    let new_owner = state.pending_owner;
    state.owner = new_owner;
    state.pending_owner = Pubkey::default();

    emit!(events::OwnershipTransferAccepted {
        old_owner,
        new_owner,
    });

    Ok(())
}

/// Enable a new LLTV value
#[derive(Accounts)]
pub struct EnableLltv<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ ParalendError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn handle_enable_lltv(ctx: Context<EnableLltv>, lltv: u64) -> Result<()> {
    require!(lltv > 0 && lltv < BPS, ParalendError::InvalidLltv);

    let state = &mut ctx.accounts.protocol_state;
    require!(
        !state.is_lltv_enabled(lltv),
        ParalendError::LltvAlreadyEnabled
    );
    require!(
        (state.lltv_count as usize) < MAX_LLTVS,
        ParalendError::MaxLltvsReached
    );

    let idx = state.lltv_count as usize;
    state.enabled_lltvs[idx] = lltv;
    state.lltv_count += 1;

    emit!(events::LltvEnabled { lltv });

    Ok(())
}

/// Enable a new IRM
#[derive(Accounts)]
pub struct EnableIrm<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ ParalendError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn handle_enable_irm(ctx: Context<EnableIrm>, irm: Pubkey) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    require!(
        !state.is_irm_enabled(&irm),
        ParalendError::IrmAlreadyEnabled
    );
    require!(
        (state.irm_count as usize) < MAX_IRMS,
        ParalendError::MaxIrmsReached
    );

    let idx = state.irm_count as usize;
    state.enabled_irms[idx] = irm;
    state.irm_count += 1;

    emit!(events::IrmEnabled { irm });

    Ok(())
}

/// Set the protocol fee for a market (owner only)
#[derive(Accounts)]
#[instruction(market_id: [u8; 32], fee: u64)]
pub struct SetFee<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ ParalendError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, crate::state::market::Market>,
}

pub fn handle_set_fee(ctx: Context<SetFee>, _market_id: [u8; 32], fee: u64) -> Result<()> {
    require!(fee <= MAX_FEE_BPS, ParalendError::FeeExceedsMax);
    ctx.accounts.market.fee = fee;
    Ok(())
}

// ─── Static Oracle (interim until PriceCache lands) ───────────────────────────

/// Create a StaticOracle PDA. Owner-gated to prevent the permissionless-oracle
/// critical (attacker becomes price admin). Will be replaced by the crank-
/// attested PriceCache oracle in a follow-up commit; kept here to preserve
/// test coverage during the migration.
#[derive(Accounts)]
#[instruction(feed_id: [u8; 32])]
pub struct CreateStaticOracle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == payer.key() @ ParalendError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer = payer,
        space = StaticOracle::SPACE,
        seeds = [SEED_PREFIX, SEED_STATIC_ORACLE, &feed_id],
        bump,
    )]
    pub oracle: Account<'info, StaticOracle>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_static_oracle(
    ctx: Context<CreateStaticOracle>,
    feed_id: [u8; 32],
    initial_price_wad: u128,
) -> Result<()> {
    require!(initial_price_wad > 0, ParalendError::OraclePriceNonPositive);

    let oracle = &mut ctx.accounts.oracle;
    oracle.bump = ctx.bumps.oracle;
    oracle.feed_id = feed_id;
    oracle.price_wad = initial_price_wad;
    oracle.admin = ctx.accounts.payer.key();
    oracle.last_update = Clock::get()?.unix_timestamp;

    Ok(())
}

/// Update the price on a StaticOracle. Only the oracle's admin can call this.
#[derive(Accounts)]
pub struct SetStaticOraclePrice<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = oracle.admin == admin.key() @ ParalendError::Unauthorized,
    )]
    pub oracle: Account<'info, StaticOracle>,
}

pub fn handle_set_static_oracle_price(
    ctx: Context<SetStaticOraclePrice>,
    new_price_wad: u128,
) -> Result<()> {
    require!(new_price_wad > 0, ParalendError::OraclePriceNonPositive);
    let oracle = &mut ctx.accounts.oracle;
    oracle.price_wad = new_price_wad;
    oracle.last_update = Clock::get()?.unix_timestamp;
    Ok(())
}
