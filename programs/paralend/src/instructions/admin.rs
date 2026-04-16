use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ParalendError;
use crate::events;
use crate::state::market::Market;
use crate::state::oracle::PriceCache;
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

// ─── PriceCache (crank-attested oracle) ───────────────────────────────────────

/// Register a PriceCache PDA for a market. Owner-only. Binds the cache
/// to the market's collateral feed_id and designates an attester pubkey.
/// Seeds it with an initial price that serves as the first EMA sample.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct RegisterPriceCache<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Boxed: ProtocolState is ~900 B and overflows the BPF stack frame
    /// otherwise.
    #[account(
        seeds = [SEED_PREFIX, SEED_PROTOCOL],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == payer.key() @ ParalendError::Unauthorized,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    /// Market this cache will serve. Binds the cache's feed_id to
    /// `market.collateral_oracle_feed_id`.
    #[account(
        seeds = [SEED_PREFIX, SEED_MARKET, &market_id],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init,
        payer = payer,
        space = PriceCache::SPACE,
        seeds = [SEED_PREFIX, SEED_PRICE_CACHE, &market_id],
        bump,
    )]
    pub price_cache: Box<Account<'info, PriceCache>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_register_price_cache(
    ctx: Context<RegisterPriceCache>,
    market_id: [u8; 32],
    attester: Pubkey,
    initial_price_wad: u128,
) -> Result<()> {
    require!(
        initial_price_wad > 0,
        ParalendError::OraclePriceNonPositive
    );

    let market = &ctx.accounts.market;
    let clock = Clock::get()?;

    let cache = &mut ctx.accounts.price_cache;
    cache.bump = ctx.bumps.price_cache;
    cache.market_id = market_id;
    cache.feed_id = market.collateral_oracle_feed_id;
    cache.attester = attester;
    cache.ema_price_wad = initial_price_wad;
    cache.last_spot_wad = initial_price_wad;
    cache.last_update_slot = clock.slot;
    cache.last_update_ts = clock.unix_timestamp;
    cache.reserved = [0u8; 64];

    emit!(events::PriceCacheRegistered {
        market_id,
        feed_id: market.collateral_oracle_feed_id,
        attester,
        initial_price_wad,
    });

    Ok(())
}

/// Attest a new spot price. Signer must be the registered `attester`.
/// Deviation-checked vs the last spot (±MAX_PRICE_DEVIATION_BPS) and folded
/// into the EMA with a fixed 10 % weight per attestation.
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct AttestPrice<'info> {
    pub attester: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PRICE_CACHE, &market_id],
        bump = price_cache.bump,
        constraint = price_cache.attester == attester.key() @ ParalendError::AttesterNotAuthorized,
    )]
    pub price_cache: Account<'info, PriceCache>,
}

pub fn handle_attest_price(
    ctx: Context<AttestPrice>,
    _market_id: [u8; 32],
    new_spot_wad: u128,
) -> Result<()> {
    require!(
        new_spot_wad > 0,
        ParalendError::OraclePriceNonPositive
    );

    let cache = &mut ctx.accounts.price_cache;
    let clock = Clock::get()?;

    // Deviation check against last spot (skipped on the first attestation
    // after registration — bootstrap edge case covered by init seeding).
    if cache.last_spot_wad > 0 {
        let prev = cache.last_spot_wad;
        let band = prev
            .checked_mul(MAX_PRICE_DEVIATION_BPS as u128)
            .ok_or_else(|| error!(ParalendError::MathOverflow))?
            .checked_div(BPS as u128)
            .ok_or_else(|| error!(ParalendError::DivisionByZero))?;
        let diff = if new_spot_wad > prev {
            new_spot_wad - prev
        } else {
            prev - new_spot_wad
        };
        require!(diff <= band, ParalendError::PriceDeviationExceeded);
    }

    // Linear EMA with fixed alpha = 10 % (new spot weighted 1/10).
    // Closed-form: ema_new = (ema_old * 9 + spot) / 10.
    // Precision note: intermediate u128 can hold prices up to ~3.4e38 so
    // (ema * 9) fits comfortably for any realistic WAD-scaled price.
    let ema_new = if cache.ema_price_wad == 0 {
        new_spot_wad
    } else {
        cache
            .ema_price_wad
            .checked_mul(9)
            .ok_or_else(|| error!(ParalendError::MathOverflow))?
            .checked_add(new_spot_wad)
            .ok_or_else(|| error!(ParalendError::MathOverflow))?
            / 10
    };

    cache.last_spot_wad = new_spot_wad;
    cache.ema_price_wad = ema_new;
    cache.last_update_slot = clock.slot;
    cache.last_update_ts = clock.unix_timestamp;

    emit!(events::PriceAttested {
        market_id: cache.market_id,
        spot_wad: new_spot_wad,
        ema_wad: ema_new,
        slot: clock.slot,
    });

    Ok(())
}

/// Permissionless crank to bump `last_update_ts` without changing the price.
/// Useful when the attester is briefly offline and a consumer would otherwise
/// hit the staleness guard. Records current slot but does NOT update the
/// EMA (no new price info). Rejects if last attested price is > 2×MAX age
/// (forces a real attestation rather than zombie-keeping-alive).
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct PokePrice<'info> {
    #[account(
        mut,
        seeds = [SEED_PREFIX, SEED_PRICE_CACHE, &market_id],
        bump = price_cache.bump,
    )]
    pub price_cache: Account<'info, PriceCache>,
}

pub fn handle_poke_price(
    ctx: Context<PokePrice>,
    _market_id: [u8; 32],
) -> Result<()> {
    let cache = &mut ctx.accounts.price_cache;
    let clock = Clock::get()?;

    // Only honour pokes if the last attest was within 2× the staleness
    // threshold — otherwise we'd mask a dead oracle.
    let since_attest = clock.unix_timestamp.saturating_sub(cache.last_update_ts);
    require!(
        since_attest >= 0 && (since_attest as u64) <= MAX_ORACLE_AGE * 2,
        ParalendError::OraclePriceStale
    );

    // No change to prices; only refresh slot stamp for observability.
    cache.last_update_slot = clock.slot;
    emit!(events::PriceCachePoked {
        market_id: cache.market_id,
        slot: clock.slot,
    });

    Ok(())
}
