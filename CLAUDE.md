# Nucleus — Permissionless Isolated Lending on Solana

Colosseum Frontier hackathon (Apr 6 – May 11, 2026). DeFi track. $25K prize + $250K accelerator.

**The pitch:** Morpho Blue earns $132M ARR on Ethereum. Zero equivalent exists on Solana. Kamino V2 claims "permissionless" but requires admin key in practice. Nucleus is trustless-first — anyone creates a lending market with 5 parameters in one transaction. No admin, no governance, no whitelist.

---

## CRITICAL RULES FOR CLAUDE

**These rules are mandatory. Violating them causes bugs and wasted time.**

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
3. Sync IDL to frontend: `cp target/idl/nucleus.json app/src/lib/nucleus-idl.json`
4. Sync types: `cp target/types/nucleus.ts app/src/lib/nucleus-idl-types.ts`
5. Update ALL tests that call the instruction
6. Update SDK client methods
7. Update frontend calls
8. Run full test suite: `anchor test`

### Rule 3: Test Everything Before Deploy
- `cargo test` must pass 100%
- `anchor test` must pass 100%
- Review all TODO/FIXME comments
- Deployment is expensive (2+ SOL) — only deploy when ready

### Rule 4: Document Mistakes
Add to MISTAKES.md when errors occur. Learn from them.

---

## Current Status (Apr 16, 2026)

| Layer | Status | Notes |
|-------|--------|-------|
| Anchor program | ✅ Complete | 20/20 integration tests passing |
| Rust unit tests | ✅ 28/28 passing | math, shares, IRM |
| TypeScript SDK | ✅ Complete | NucleusClient, PDA helpers, math utils |
| Next.js frontend | ✅ Built + deployed | Live on Vercel |
| Demo scripts | ✅ Working | setup-demo-markets, fund-demo, liquidation-bot |
| GitHub repo | ✅ Private | github.com/vijaygopalbalasa/nucleus-protocol |
| Vercel deploy | ✅ Live | nucleus-frontend-67t0tqgai-vijaygopal-balasas-projects.vercel.app |
| Devnet program | ✅ Deployed | ForUjmX3VzE5EsRfzktF529LToK7vyzx6czH5o1dUTY8 |
| Demo markets | ✅ Live | wSOL/USDC, JitoSOL/USDC, JUP/USDC with liquidity |

---

## Toolchain

```bash
# Required versions
solana --version      # agave-cli 3.1.12
rustc --version       # rustc 1.94.1 (stable)
anchor --version      # anchor-cli 0.31.1

# Install Agave 3.1.12 (not vanilla Solana CLI 1.18.x — BPF uses bundled Cargo 1.75 which breaks)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Use rustup stable (NOT 1.79 from rust-toolchain.toml)
rustup default stable
```

**No `rust-toolchain.toml` in this repo.** Deleted — Rust 1.79 breaks edition2024 transitive deps.

---

## Build Commands

```bash
# Build program
anchor build

# Run unit tests (math, state) — 28/28 passing
cargo test --manifest-path programs/nucleus/Cargo.toml

# Run integration tests (localnet) — 19/19 passing
anchor test

# Type-check SDK and scripts (not tests — ts-mocha handles those)
npx tsc --noEmit --project tsconfig.json

# Type-check frontend
cd app && npx tsc --noEmit

# Build frontend
cd app && npm run build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Generate IDL + types
anchor build --idl
```

---

## Project Layout

```
colosseum-frontier/
  Anchor.toml
  Cargo.toml                        # workspace
  tsconfig.json                     # covers sdk/ + scripts/ only (NOT app/ or tests/)
  programs/nucleus/
    Cargo.toml                      # no solana-program direct dep (zeroize conflict)
    src/
      lib.rs                        # declare_id!, program entry
      constants.rs                  # WAD, BPS, seeds, VIRTUAL_SHARES, MAX_*
      errors.rs                     # NucleusError (26 codes)
      events.rs                     # Anchor events
      math/
        mod.rs
        safe_math.rs                # checked ops
        wad.rs                      # mul_div_down/up, wad_mul_*, w_taylor_compounded
        shares.rs                   # to_shares_down/up, to_assets_down/up
        interest.rs                 # accrue_interest_on_market, compute_utilization
      state/
        mod.rs
        protocol.rs                 # ProtocolState PDA (singleton)
        market.rs                   # Market PDA + compute_market_id
        position.rs                 # Position PDA (per user per market)
        irm.rs                      # LinearIrm PDA
      instructions/
        mod.rs
        admin.rs                    # initialize_protocol, enable_lltv, enable_irm, set_fee
        market.rs                   # create_irm, create_market (+ vault init)
        position.rs                 # create_position
        supply.rs                   # supply, withdraw
        collateral.rs               # supply_collateral, withdraw_collateral
        borrow.rs                   # borrow, repay
        liquidate.rs                # liquidate (LIF calc, bad debt socialization)
        utils.rs                    # accrue_interest_ix, claim_fees
        flash_loan.rs               # flash_loan_start/end (same-tx atomic)
      interfaces/
        oracle.rs                   # StaticOracle (localnet) + get_loan_price helpers
  sdk/src/
    constants.ts                    # WAD, BPS, seeds, PROGRAM_ID
    pdas.ts                         # 7 derive*PDA functions (findProgramAddressSync)
    math.ts                         # computeMarketId, shares math, APY, health factor, IRM
    types.ts                        # MarketState, PositionState, IrmState, etc.
    client.ts                       # NucleusClient class — fetch + instruction builders
    index.ts                        # barrel re-export
  scripts/
    setup-demo-markets.ts           # creates 3 demo markets + oracles on devnet
    fund-demo.ts                    # mints tokens, supplies liquidity, creates positions
    liquidation-bot.ts              # polls positions, liquidates unhealthy ones
  app/
    src/
      app/                          # Next.js App Router pages
        page.tsx                    # landing — hero, stats, comparison table
        markets/page.tsx            # markets table (live chain data via useMarkets hook)
        markets/[id]/page.tsx       # supply/borrow/collateral tabs, market params
        create/page.tsx             # 5-field market creation form + LLTV slider
        positions/page.tsx          # user positions with health factors (usePositions hook)
      hooks/
        useMarkets.ts               # polls program.account.market.all() every 30s
        usePositions.ts             # memcmp filter on owner field, computes health factor
      lib/
        constants.ts                # PROGRAM_ID, WAD, BPS, DEMO_MARKETS, TOKEN_META
        nucleus-idl.json            # copy of target/idl/nucleus.json for Next.js
        nucleus-idl-types.ts        # copy of target/types/nucleus.ts
        nucleus-rpc.ts              # server-side getAllMarkets, getProtocolStats
        utils.ts                    # cn(), formatUSD(), formatAPY(), formatHealthFactor()
      components/
        WalletProvider.tsx          # Phantom+Solflare adapters, autoConnect
        Navbar.tsx                  # sticky nav, WalletMultiButton
        ui/                         # button, card, input, badge, stat primitives
  tests/
    nucleus.ts                      # 19 integration tests (run via anchor test / ts-mocha)
```

---

## Known TypeScript Gotchas

### Root tsconfig scope
The root `tsconfig.json` covers **only** `sdk/src/`, `scripts/`, and `migrations/`. It deliberately **excludes** `tests/` and `app/`:

- `tests/` is compiled by ts-mocha at runtime via `anchor test`. Anchor 0.31's `.accounts()` type uses discriminated unions — TypeScript rejects multi-key objects but they work correctly at runtime.
- `app/` has its own `tsconfig.json` with `jsx: preserve`, `dom` lib, path aliases.

### Anchor 0.31 `.accounts()` typing
In Anchor 0.31, `.accounts()` expects discriminated unions (one key at a time) for strict type safety. Tests use `.accounts()` multi-key which works at runtime but triggers TS2353. Tests pass 19/19. If you add new tests, either use `.accountsPartial()` (accepts partial objects) or add `// @ts-ignore`.

### getAllMarkets() and market IDs
`NucleusClient.getAllMarkets()` returns `publicKey` (the account address) but `marketId` is a 32-byte zero buffer because the `Market` account doesn't store its own ID. Use `computeMarketId(params)` to get the real ID from known params.

---

## PDA Seeds

```rust
// ProtocolState (singleton)
seeds = [b"nucleus", b"protocol_state"]

// Market
// market_id = keccak256(collateral_mint || loan_mint || collateral_oracle_feed_id || loan_oracle_feed_id || irm || lltv.to_le_bytes())
seeds = [b"nucleus", b"market", &market_id]

// Vault token accounts (owned by Market PDA via CPI)
seeds = [b"nucleus", b"collateral_vault", &market_id]
seeds = [b"nucleus", b"loan_vault", &market_id]

// Position (per user per market)
// memcmp filter for owner: offset = 8 (disc) + 1 (bump) + 32 (market_id) = 41
seeds = [b"nucleus", b"position", &market_id, owner.as_ref()]

// LinearIrm
seeds = [b"nucleus", b"linear_irm", admin.as_ref(), &nonce.to_le_bytes()]

// StaticOracle (localnet only)
seeds = [b"nucleus", b"static_oracle", &feed_id]
```

---

## Share Math Conventions

All accounting uses u128. Rounding **always favors the protocol**:

| Operation | Direction | Why |
|-----------|-----------|-----|
| Supply: assets → shares | Round DOWN | User gets fewer shares |
| Withdraw: shares → assets | Round DOWN | User gets fewer assets |
| Borrow: assets → shares | Round UP | User owes more shares |
| Repay: shares → assets | Round UP | User pays more assets |

**Inflation attack protection:** `VIRTUAL_SHARES = 1_000_000`, `VIRTUAL_ASSETS = 1`

Formula: `shares = (assets * (total_shares + VIRTUAL_SHARES)) / (total_assets + VIRTUAL_ASSETS)`

---

## Interest Rate Model

Kinked IRM stored as LinearIrm PDA. All rates WAD-scaled per-second.

```
0% util → 0% APY
80% util (kink) → ~4% APY borrow
100% util → ~50% APY borrow
```

Default params (as WAD-scaled per-second rates):
- `base_rate = 0`
- `slope1 = WAD * 5 / 100 / 31_536_000`   (5% APY per unit of utilization below kink)
- `slope2 = WAD * 230 / 100 / 31_536_000`  (230% APY per unit above kink)
- `kink = WAD * 80 / 100`                  (80%)

Interest accrual is **lazy** — happens on every instruction that touches a market, not on a crank.

---

## Oracle

- **Production:** Pyth pull oracle (`PriceUpdateV2`). Staleness: 60 seconds. Confidence: reject if `conf > price * 5%`.
- **Localnet/Testing:** `StaticOracle` PDA — admin-updatable price, lets us stage liquidations.
- Markets store `collateral_oracle_feed_id: [u8; 32]` and `loan_oracle_feed_id: [u8; 32]`. All-zeros loan feed = assume $1/token (stablecoin shortcut, handles decimals via `WAD / 10^decimals`).

---

## Liquidation

```
health_factor = (collateral_value * lltv) / (debt_value * BPS)
// healthy if >= BPS (i.e., >= 1.0 in BPS space)

lif = min(BPS * 115 / 100, BPS * BPS / (BPS - (BPS - lltv) * 30 / 100))
// Liquidation Incentive Factor

repaid_assets = seized_collateral * collateral_price * BPS / (loan_price * lif)
```

Bad debt socialization: if collateral=0 but borrow_shares remain after liquidation, subtract remaining debt from `total_supply_assets` (socializes loss across suppliers).

---

## Dependency Notes

```toml
# Cargo.toml — programs/nucleus
[dependencies]
anchor-lang = { version = "0.31.1", features = ["init-if-needed"] }
anchor-spl = "0.31.1"
# NO explicit solana-program — causes zeroize version conflict
# Access via: anchor_lang::solana_program::keccak, etc.
```

---

## Week-by-Week Plan

| Week | Focus | Status |
|------|-------|--------|
| 1 | Core Anchor program | ✅ Complete (19/19 tests) |
| 2 | SDK + frontend + devnet deploy | ✅ SDK+frontend done; devnet pending SOL |
| 3 | Polish, real oracle integration | Pending |
| 4 | Flash loans demo, liquidation bot live | Partially done (code written) |
| 5 | Demo video + submit | Pending |

### Week 1 — Done
- [x] **Day 1** — Math (wad, shares, interest), state structs, admin + market + position instructions
- [x] **Day 2** — supply_collateral, withdraw_collateral, StaticOracle (localnet)
- [x] **Day 3** — supply, withdraw (lender), share accounting, accrue_interest crank
- [x] **Day 4** — borrow, repay (with health check via StaticOracle)
- [x] **Day 5** — liquidate (LIF calc, bad debt socialization), full instruction surface complete
- [x] **Day 6** — 19/19 integration tests passing (full flow + flash loans + liquidation)

### Week 2 — Done
- [x] TypeScript SDK (`sdk/src/`) — NucleusClient, PDA helpers, math utils, APY calculations, zero tsc errors
- [x] Demo scripts (`scripts/`) — setup-demo-markets.ts, fund-demo.ts, liquidation-bot.ts
- [x] Next.js frontend (`app/`) — markets, positions, create, home pages with live chain data hooks
- [x] GitHub repo — private, at github.com/vijaygopalbalasa/nucleus-protocol
- [x] Vercel deployment — live at nucleus-frontend-cuu50kx4x-vijaygopal-balasas-projects.vercel.app
- [x] Detective audit — 6 bugs fixed (see commit e910cb4)
- [ ] Devnet program deploy — blocked on 4.25 SOL (faucet rate-limited)

---

## Competitive Differentiation

**When judges ask "What about Kamino V2?":**

> "Kamino V2 requires an admin key to create markets — it's a curated product. Nucleus is a protocol: the market address is the keccak hash of its 5 parameters. There is no admin, no governance, no ability to pause a specific market. It's the same difference as Compound vs Morpho."

**Key numbers for the pitch:**
- Morpho Blue: $132M ARR on Ethereum, $5.8-13B TVL
- Kamino V2: All markets team-curated in practice
- Nucleus: First truly permissionless isolated lending on Solana

---

## Demo Script (3 min)

1. **0:00-0:15** — Landing page with live TVL. Hook: "Kamino takes months to list a new token. Nucleus takes 30 seconds."
2. **0:15-0:45** — Create JUP/USDC market live. 5 fields. 400ms confirmation. **This is the wow moment.**
3. **0:45-1:30** — Supply 5000 USDC. Switch wallet, post JUP collateral, borrow 3000 USDC. Show health factor.
4. **1:30-2:00** — Liquidate pre-staged unhealthy position.
5. **2:00-2:30** — Positions page with health factors.
6. **2:30-3:00** — Close: "$132M ARR on Ethereum. Zero on Solana. Nucleus is it."

---

## Program ID

```
ForUjmX3VzE5EsRfzktF529LToK7vyzx6czH5o1dUTY8  (devnet — deployed Apr 16, 2026)
```

---

## Devnet Deployment (Complete)

**Live demo markets:**
- wSOL / USDC — 25k USDC supplied, 3k borrowed
- JitoSOL / USDC — 25k USDC supplied  
- JUP / USDC — created, needs liquidity

**Frontend:** https://nucleus-frontend-67t0tqgai-vijaygopal-balasas-projects.vercel.app

### Redeploy (if needed)
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
~/.cargo/bin/anchor build
~/.cargo/bin/anchor deploy --provider.cluster devnet
```

### After deploy — update Program ID in 4 places
```bash
# 1. programs/nucleus/src/lib.rs — declare_id!("NEW_ID")
# 2. Anchor.toml — [programs.devnet] nucleus = "NEW_ID"
# 3. sdk/src/constants.ts — PROGRAM_ID = new PublicKey("NEW_ID")
# 4. app/src/lib/constants.ts — PROGRAM_ID = "NEW_ID"
```

### Create demo markets
```bash
export HELIUS_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
npx ts-node --project tsconfig.json scripts/setup-demo-markets.ts --cluster=devnet
npx ts-node --project tsconfig.json scripts/fund-demo.ts --cluster=devnet
```

### Update Vercel env and redeploy
```bash
cd app
vercel env add NEXT_PUBLIC_RPC_URL production
# Enter: https://devnet.helius-rpc.com/?api-key=YOUR_KEY
vercel --prod
```

### Start liquidation bot
```bash
# Keep running in background for demo — liquidates unhealthy positions
npx ts-node --project tsconfig.json scripts/liquidation-bot.ts --cluster=devnet &
```

---

## Known Limitations (Intentionally Deferred)

These features are documented but not implemented. They are acceptable for hackathon demo but should be added for production:

### 1. Position Closure (Low Priority)
- **What:** Add `close_position` instruction to reclaim rent when position is empty
- **Why deferred:** Rent is ~0.002 SOL. Not critical for demo.
- **Risk:** Users accumulate small locked rent over many positions.
- **TODO location:** `programs/nucleus/src/instructions/position.rs`

### 2. Fee-on-Transfer Token Support (Medium Priority)
- **What:** Detect and handle tokens that take fees on transfer (e.g., some rebasing tokens)
- **Why deferred:** Demo uses standard SPL tokens. Complex to implement correctly.
- **Risk:** Accounting mismatch if fee-on-transfer token is used as loan/collateral.
- **TODO location:** `programs/nucleus/src/instructions/supply.rs`, `collateral.rs`

### 3. Cross-Market Flash Loan Isolation (Low Priority)
- **What:** Prevent flash loans from being used to manipulate other markets
- **Why deferred:** Single-market demo. Attacker would need significant capital anyway.
- **Risk:** Sophisticated attacker could manipulate oracle prices across markets.
- **TODO location:** `programs/nucleus/src/instructions/flash_loan.rs`

---

## Test Requirements

Every instruction MUST have:
1. **Happy path test** — successful execution with valid inputs
2. **Error case tests** — verify each possible error condition
3. **Access control test** — unauthorized callers are rejected
4. **Edge case tests** — zero amounts, max values, boundary conditions

Test file structure:
```
tests/
  nucleus.ts           # Main integration tests (happy paths)
  security.ts          # Security-focused tests (pause, staleness, access)
  errors.ts            # Negative tests (all error codes)
  edge-cases.ts        # Boundary conditions, precision, overflow
```

Run all tests: `anchor test`
Run specific file: `anchor test -- --grep "security"`
