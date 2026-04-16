# Paralend — Credit for Prediction Markets on Solana

Colosseum Frontier hackathon (Apr 6 – May 11, 2026).
Live on devnet at **`2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8`**.

**The pitch.** Kalshi tokenized thousands of their prediction markets on Solana (via DFlow, Dec 2025). Combined with Polymarket that's >$20B/mo of open event-positions sitting as SPL tokens, 0 % of which is borrowable. Paralend is the first credit layer for that pool: deposit your Kalshi YES/NO tokens, borrow USDC at a time-decayed LLTV, repay or get force-closed before resolution. Same mental model as Morpho-against-LSTs — but for an asset class with a resolution cliff, which is why it needs its own protocol.

**Why this is a distinct product, not a Kamino feature.** Binary-outcome collateral breaks every assumption a general lending protocol makes: value can cliff to $0 on resolution, variance explodes as T→0, and there's no Pyth feed for "P(BTC > $150k by Jun 2026)". Paralend ships the five mechanisms specific to this asset class: time-decay LLTV, force-close window, resolution handler, per-market crank-attested price cache, and deterministic post-resolution settlement.

---

## CRITICAL RULES FOR CLAUDE

These rules are mandatory. Violating them causes bugs and wasted time.

### Rule 1: Read Before Write
**ALWAYS read the full context of any file before modifying it.**
- Read related files that import/use the code being changed
- Search for usages of functions/structs being modified
- Check tests that exercise the code path
- Understand the purpose, not just the syntax

### Rule 2: Update All Consumers
When changing instruction signatures (adding/removing accounts or args):
1. Update the program instruction
2. Rebuild IDL: `anchor build`
3. Sync IDL to frontend: `cp target/idl/paralend.json app/src/lib/paralend-idl.json`
4. Sync types: `cp target/types/paralend.ts app/src/lib/paralend-idl-types.ts`
5. Update ALL tests that call the instruction
6. Update SDK client methods (`sdk/src/client.ts`)
7. Update frontend calls
8. Update scripts (`scripts/*.ts`) that use the SDK
9. Run `anchor test` and verify green

### Rule 3: Test Everything Before Deploy
- `cargo test --manifest-path programs/paralend/Cargo.toml --lib` must pass 100 %
- `anchor test` must pass 100 %
- `tsc --noEmit --project tsconfig.json` green (SDK + scripts)
- `cd app && npx tsc --noEmit` green (frontend)
- `anchor deploy` to devnet costs ~4.9 SOL fresh; upgrades similar cost without SOL-saving tricks. Only deploy when ready.

### Rule 4: Document Mistakes
Add to `MISTAKES.md` when errors occur. Learn from them.

---

## Current Status (Apr 17, 2026)

| Layer | Status | Notes |
|-------|--------|-------|
| Anchor program | ✅ Complete | 25 instructions, full Paralend surface live |
| Rust unit tests | ✅ 37/37 passing | math (shares, wad, interest, decay), IRM, ID sanity |
| Integration tests | ✅ 9/9 passing | tests/paralend.ts — init, ownership, PriceCache, supply+borrow |
| TypeScript SDK | ✅ Complete | `ParalendClient` + all instruction builders |
| Next.js frontend | ✅ Complete + compiles | landing, markets list (with decay countdown), market detail (with decay curve), positions |
| Devnet deploy | ✅ Live | `2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8` |
| Demo markets seeded | ✅ Live (3 markets) | BTC-150K (45d), SOL-300 (8d), NFL-FINAL (18h) |
| Attester daemon | ✅ Works | `scripts/attester.ts` — 20s interval |
| Force-close bot | ✅ Works | `scripts/force-close-bot.ts` — 30s interval |
| On-chain post-audit hardening | ⏳ Committed, queued for next redeploy | See commit `5215d8a` — need ~4.9 SOL to upgrade |

---

## Paralend architecture (what makes it different)

```
    user (Phantom)
       │ deposit YES/NO tokens + borrow USDC
       ▼
┌──────────────────────────────────────────────────────────┐
│  Paralend Anchor Program                                 │
│  ┌──────────────────────────────────────────────────┐    │
│  │ State                                            │    │
│  │  • ProtocolState (singleton, owner + attester)   │    │
│  │  • Market (per Kalshi event)                     │    │
│  │      - resolution_timestamp, market_status       │    │
│  │      - base_lltv (capped to 70% for PM)          │    │
│  │      - kalshi_ticker                             │    │
│  │  • Position (per user per market)                │    │
│  │  • LinearIrm (interest rate model)               │    │
│  │  • PriceCache (EMA oracle, per market)           │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Novel instructions                               │    │
│  │  • register_price_cache / attest_price /         │    │
│  │    poke_price / rotate_attester                  │    │
│  │  • force_close_position (2h pre-resolution)      │    │
│  │  • handle_resolution (attester marks outcome)    │    │
│  │ Standard lending (supply/borrow/repay/liquidate) │    │
│  │ + time-decay LLTV on every health check          │    │
│  └──────────────────────────────────────────────────┘    │
└──────┬──────────────────────────────┬────────────────────┘
       │ CPI redeem (post-resolution)  │ read spot
       ▼                               ▼
   DFlow CLPs                   off-chain attester daemon
   (Kalshi YES/NO)              (scripts/attester.ts pulls
                                 Kalshi REST, pushes on-chain)
```

**Five mechanisms specific to this asset class** (none are in Kamino / Jupiter Lend):

1. **Time-decay LLTV** (`programs/paralend/src/math/decay.rs`). Effective LLTV ramps linearly from `base_lltv` to 0 over the final 7 days before resolution, capped at 70 % for binary-outcome collateral. Applied at every health check via `interfaces/oracle.rs::is_position_healthy`.
2. **Force-close window** (`programs/paralend/src/instructions/resolution.rs::handle_force_close_position`). Callable in `[T − 7200 s, T)`. Seizes ALL collateral, bounty scales 50 → 300 bps. Uses stale-tolerant oracle read so a dead attester can't freeze the last clearing path.
3. **Resolution handler** (`handle_resolution`). Attester flips `market_status = Resolved`, records `outcome_bit`. Market paused — no new borrows or liquidations. Per-position redemption is off-chain via DFlow.
4. **PriceCache oracle**. Per-market PDA, crank-attested EMA (α = 1/10), ±5 % deviation band bound against BOTH `last_spot` AND `ema` (prevents attester from walking EMA via ratcheting). Staleness = 30 s. `poke_price` extends staleness by one window without changing price when attester is briefly offline. `rotate_attester` (owner-gated) covers key compromise.
5. **POST_BORROW_CUTOFF**. Hard block on new borrows in the final 30 min before resolution — prevents last-second leverage against the binary cliff even if the decay curve alone would still permit.

---

## Toolchain

```bash
solana --version     # agave-cli 3.1.12
rustc --version      # rustc 1.94.1 stable
anchor --version     # anchor-cli 0.31.1
node --version       # 20.x
```

Install agave:
```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

No `rust-toolchain.toml` in repo — pinning breaks edition2024 transitive deps.

---

## Build Commands

```bash
# Build program + refresh IDL
anchor build

# Rust unit tests (math + IRM + decay) — 37/37 passing
cargo test --manifest-path programs/paralend/Cargo.toml --lib

# Integration tests against a fresh localnet validator — 9/9 passing
anchor test

# TS compile checks
npx tsc --noEmit --project tsconfig.json     # sdk + scripts
cd app && npx tsc --noEmit                   # frontend

# Deploy / upgrade to devnet (needs ~4.9 SOL)
anchor deploy --provider.cluster devnet

# Seed 3 demo markets + attester keypair + PriceCaches
npx ts-node --project tsconfig.json scripts/setup-demo-markets.ts --cluster=devnet

# Seed lender liquidity + borrower positions
npx ts-node --project tsconfig.json scripts/fund-demo.ts --cluster=devnet

# Keep attestations fresh (leave running in tmux/pm2)
npx ts-node --project tsconfig.json scripts/attester.ts --cluster=devnet --interval=20

# Force-close watcher (keep running)
npx ts-node --project tsconfig.json scripts/force-close-bot.ts --cluster=devnet --interval=30
```

Full procedure in **`DEPLOYMENT.md`**.

---

## Project Layout

```
colosseum-frontier/
  Anchor.toml                          # programs.devnet = 2kZNrHd7...
  Cargo.toml                           # workspace
  DEPLOYMENT.md                        # step-by-step devnet runbook
  CLAUDE.md                            # this file
  programs/paralend/                   # Anchor program
    Cargo.toml
    src/
      lib.rs                           # 25 instructions
      constants.rs                     # WAD, BPS, caps, seeds
      errors.rs                        # ParalendError (30+ codes)
      events.rs                        # Anchor events
      math/
        mod.rs
        wad.rs                         # mul_div_{up,down}, wad_mul_*, w_taylor_compounded
        shares.rs                      # ERC4626-style virtual-offset share math
        interest.rs                    # accrue_interest_on_market (skips resolved markets)
        decay.rs                       # compute_effective_lltv — the novel piece
        safe_math.rs
      state/
        mod.rs
        protocol.rs                    # ProtocolState PDA
        market.rs                      # Market PDA + resolution_timestamp + kalshi_ticker
        position.rs                    # Position PDA
        irm.rs                         # LinearIrm PDA
        oracle.rs                      # PriceCache PDA (replaces StaticOracle)
      interfaces/
        oracle.rs                      # read_price_cache{,_stale_ok} + is_position_healthy
      instructions/
        mod.rs
        admin.rs                       # init, ownership, price cache, rotate_attester
        market.rs                      # create_irm, create_market (with resolution_ts + ticker)
        position.rs                    # create_position, close_position
        supply.rs                      # supply, withdraw
        collateral.rs                  # supply_collateral, withdraw_collateral
        borrow.rs                      # borrow (POST_BORROW_CUTOFF enforced), repay
        liquidate.rs                   # liquidate (blocked if paused OR in force-close window)
        resolution.rs                  # force_close_position, handle_resolution
        utils.rs                       # accrue_interest, claim_fees
  sdk/src/                             # TypeScript SDK
    constants.ts                       # PROGRAM_ID, WAD, BPS, seeds
    types.ts                           # MarketState, PositionState, PriceCacheState
    pdas.ts                            # derive*PDA helpers
    math.ts                            # shares math + computeMarketId
    client.ts                          # ParalendClient — every instruction builder
    index.ts                           # barrel re-export
  scripts/
    demo-common.ts                     # shared helpers + DEMO_MARKETS definitions
    setup-demo-markets.ts              # idempotent devnet seeder
    fund-demo.ts                       # per-market lender + borrower flows
    attester.ts                        # price attestation daemon (20s)
    force-close-bot.ts                 # force_close_position watcher (30s)
    demo-{mints,deployment,wallets,attester,config}.json   # generated artefacts (gitignored)
  app/                                 # Next.js 14 frontend
    src/
      app/
        layout.tsx, globals.css
        page.tsx                       # landing — Paralend pitch
        markets/page.tsx               # markets list + compact countdown
        markets/[id]/page.tsx          # detail — decay curve + countdown + tabs
        positions/page.tsx             # user positions
        create/page.tsx                # admin-only stub (public nav removed)
      hooks/
        useMarkets.ts, useMarketDetail.ts, usePositions.ts
      components/
        Navbar.tsx, WalletProvider.tsx
        DecayCurveChart.tsx            # pure SVG, no Recharts dep
        ResolutionCountdown.tsx        # live countdown + phase badge
        ui/                            # Button, Card, Badge, Stat, Input
      lib/
        paralend-idl.json              # copy of target/idl/paralend.json
        paralend-idl-types.ts          # copy of target/types/paralend.ts
        paralend-program.ts            # client SDK helpers
        paralend-rpc.ts                # server-side read helpers
        demo-config.{ts,json}          # markets metadata surfaced to UI
        decay.ts                       # TS mirror of math/decay.rs
        constants.ts                   # frontend constants
        utils.ts                       # cn(), format helpers
  tests/
    paralend.ts                        # 9 integration tests — full happy path
```

---

## PDA Seeds

```rust
// ProtocolState (singleton)
seeds = [b"paralend", b"protocol_state"]

// Market
// market_id = keccak256(collateral_mint || loan_mint || coll_feed || loan_feed || irm || lltv_le)
seeds = [b"paralend", b"market", &market_id]

// Market vaults
seeds = [b"paralend", b"collateral_vault", &market_id]
seeds = [b"paralend", b"loan_vault",       &market_id]

// Position (per user per market)
seeds = [b"paralend", b"position", &market_id, owner.as_ref()]

// LinearIrm
seeds = [b"paralend", b"linear_irm", admin.as_ref(), &nonce_le_bytes]

// PriceCache (per market — new in Paralend)
seeds = [b"paralend", b"price_cache", &market_id]

// ResolutionRecord (reserved for post-MVP per-position settlement)
seeds = [b"paralend", b"resolution_record", &market_id]
```

---

## Share Math Convention

All accounting uses u128. Rounding **always favours the protocol**:

| Operation | Direction | Why |
|-----------|-----------|-----|
| Supply: assets → shares | Round DOWN | User gets fewer shares |
| Withdraw: shares → assets | Round DOWN | User gets fewer assets |
| Borrow: assets → shares | Round UP | User owes more shares |
| Repay: shares → assets | Round UP | User pays more assets |

First-depositor defense: `VIRTUAL_SHARES = 1_000_000`, `VIRTUAL_ASSETS = 1`.

---

## Time-decay LLTV (novel)

```
effective_lltv =
  | base_lltv (capped at 70%)        if resolution_timestamp == 0
  |                                    OR remaining >= 7 days
  | base_lltv * remaining / 7d        if 0 < remaining < 7 days
  | 0                                  if remaining <= 0
```

Rust impl: `programs/paralend/src/math/decay.rs::compute_effective_lltv`.
TS mirror: `app/src/lib/decay.ts::computeEffectiveLltvBps`.
Rendered in UI: `app/src/components/DecayCurveChart.tsx` (pure SVG).

The function is the single shared source of truth — `is_position_healthy` in `interfaces/oracle.rs` calls it on every borrow / withdraw / liquidate / force-close, and the chart on the market detail page samples the exact same function for N future timestamps. No divergence possible between the chart and the on-chain reality.

---

## Oracle convention

- **Production:** `PriceCache` PDA, one per market. Attester-cranked EMA (α = 1/10). ±5 % deviation bound on both `last_spot` and `ema`. `MAX_ORACLE_AGE = 30 s`. `rotate_attester` handles compromise.
- **Development:** attester daemon (`scripts/attester.ts`) does a bounded random walk around the initial price for visual EMA motion. In production this would pull from Kalshi's public REST API (no auth required for market prices) or from DFlow's onchain CLP state.
- **Stale-tolerant variant:** `read_price_cache_stale_ok` — used only by `force_close_position`. Reasoning in `interfaces/oracle.rs`.

---

## Liquidation + Force-close

**Regular liquidation** (`instructions/liquidate.rs`):
- Blocked when `market.paused` (post-resolution) OR inside the 2h force-close window (canonical clearing path in that window is `force_close_position`).
- LIF formula: `raw_lif = BPS² / (BPS − LIF_CURSOR × (BPS − lltv) / BPS)`, capped at `MAX_LIF = 115 %`.
- Bad-debt socialization: if `position.collateral == 0 && borrow_shares > 0`, residual debt subtracts from `total_supply_assets`.

**Force-close** (`instructions/resolution.rs::handle_force_close_position`):
- Callable in `[T_resolution − 7200s, T_resolution)`.
- Seizes ALL collateral (binary-outcome, no partial seizure UX).
- Bounty scales 50 → 300 bps across the window (incentive to act early).
- Same bad-debt path as regular liquidation.

---

## Week Plan

| Week | Focus | Status |
|------|-------|--------|
| 1 | Pivot from Nucleus (isolated lending) to Paralend (PM credit) | ✅ Done |
| 2 | Implement decay + resolution + PriceCache | ✅ Done |
| 3 | Frontend, SDK, scripts, devnet deploy | ✅ Done |
| 3.5 | Post-audit hardening (this batch) — queued for redeploy | ⏳ Awaiting SOL |
| 4 | Polish + demo video + Colosseum Frontier submission | TODO |

---

## Open items

- Redeploy the hardening batch (commit `5215d8a`) once deploy wallet is topped up (~4.9 SOL).
- Re-seed markets (setup-demo-markets is idempotent + uses fresh resolution timestamps per run).
- Record 30-second demo video emphasising decay-curve + countdown + force-close flow.
- Write submission deck / README for Colosseum.
- (Stretch) Wire real Kalshi mainnet YES/NO mints into the setup script behind a `--mainnet` flag.
- (Stretch) Add a `close_position`/force-close button to `/positions` so demo audience can trigger force-close from the UI.

---

## MISTAKES.md hygiene

If you hit a bug that wastes > 10 min, add a one-line entry to `MISTAKES.md` so future Claude sessions don't repeat it. The whole file is a cost-of-rediscovery avoidance tool.
