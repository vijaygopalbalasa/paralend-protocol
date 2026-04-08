use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::NucleusError;
use crate::events;
use crate::state::oracle::StaticOracle;
use crate::state::protocol::ProtocolState;

/// Initialize the protocol singleton
#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
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

/// Enable a new LLTV value
#[derive(Accounts)]
pub struct EnableLltv<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ NucleusError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn handle_enable_lltv(ctx: Context<EnableLltv>, lltv: u64) -> Result<()> {
    require!(lltv > 0 && lltv < BPS, NucleusError::InvalidLltv);

    let state = &mut ctx.accounts.protocol_state;
    require!(
        !state.is_lltv_enabled(lltv),
        NucleusError::LltvAlreadyEnabled
    );
    require!(
        (state.lltv_count as usize) < MAX_LLTVS,
        NucleusError::MaxLltvsReached
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
        constraint = protocol_state.owner == owner.key() @ NucleusError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn handle_enable_irm(ctx: Context<EnableIrm>, irm: Pubkey) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    require!(
        !state.is_irm_enabled(&irm),
        NucleusError::IrmAlreadyEnabled
    );
    require!(
        (state.irm_count as usize) < MAX_IRMS,
        NucleusError::MaxIrmsReached
    );

    let idx = state.irm_count as usize;
    state.enabled_irms[idx] = irm;
    state.irm_count += 1;

    emit!(events::IrmEnabled { irm });

    Ok(())
}

/// Set the protocol fee for a market (owner only)
#[derive(Accounts)]
pub struct SetFee<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ NucleusError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(mut)]
    pub market: Account<'info, crate::state::market::Market>,
}

pub fn handle_set_fee(ctx: Context<SetFee>, fee: u64) -> Result<()> {
    require!(fee <= MAX_FEE_BPS, NucleusError::FeeExceedsMax);
    ctx.accounts.market.fee = fee;
    Ok(())
}

// ─── Static Oracle (localnet/devnet testing) ─────────────────────────────────

/// Create a StaticOracle PDA for a given feed_id.
/// Anyone can create an oracle — used for localnet testing and devnet demos.
/// On mainnet, use Pyth PriceUpdateV2 accounts instead.
#[derive(Accounts)]
#[instruction(feed_id: [u8; 32])]
pub struct CreateStaticOracle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

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
    require!(initial_price_wad > 0, NucleusError::OraclePriceNonPositive);

    let oracle = &mut ctx.accounts.oracle;
    oracle.bump = ctx.bumps.oracle;
    oracle.feed_id = feed_id;
    oracle.price_wad = initial_price_wad;
    oracle.admin = ctx.accounts.payer.key();

    Ok(())
}

/// Update the price on a StaticOracle. Only the oracle's admin can call this.
#[derive(Accounts)]
pub struct SetStaticOraclePrice<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = oracle.admin == admin.key() @ NucleusError::Unauthorized,
    )]
    pub oracle: Account<'info, StaticOracle>,
}

pub fn handle_set_static_oracle_price(
    ctx: Context<SetStaticOraclePrice>,
    new_price_wad: u128,
) -> Result<()> {
    require!(new_price_wad > 0, NucleusError::OraclePriceNonPositive);
    ctx.accounts.oracle.price_wad = new_price_wad;
    Ok(())
}
