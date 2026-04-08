# Nucleus — Permissionless Isolated Lending on Solana

Colosseum Frontier hackathon (Apr 6 – May 11, 2026). DeFi track. $25K prize + $250K accelerator.

**The pitch:** Morpho Blue earns $132M ARR on Ethereum. Zero equivalent exists on Solana. Kamino V2 claims "permissionless" but requires admin key in practice. Nucleus is trustless-first — anyone creates a lending market with 5 parameters in one transaction. No admin, no governance, no whitelist.

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

# Run unit tests (math, state)
cargo test --manifest-path programs/nucleus/Cargo.toml

# Run integration tests (localnet)
anchor test

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
        supply.rs                   # supply, withdraw         [TODO Day 4]
        collateral.rs               # supply_collateral, withdraw_collateral [TODO Day 3]
        borrow.rs                   # borrow, repay            [TODO Day 5]
        liquidate.rs                # liquidate                [TODO Day 6]
        utils.rs                    # accrue_interest_ix, claim_fees
        flash_loan.rs               # flash_loan_start/end     [TODO Week 4]
      interfaces/
        oracle.rs                   # Pyth PriceUpdateV2 + StaticOracle fallback
```

---

## PDA Seeds

```rust
// ProtocolState (singleton)
seeds = [b"nucleus", b"protocol_state"]

// Market
// market_id = keccak256(collateral_mint, loan_mint, collateral_oracle_feed_id, loan_oracle_feed_id, irm, lltv_le_bytes)
seeds = [b"nucleus", b"market", &market_id]

// Vault token accounts (owned by Market PDA via CPI)
seeds = [b"nucleus", b"collateral_vault", &market_id]
seeds = [b"nucleus", b"loan_vault", &market_id]

// Position (per user per market)
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
- Markets store `collateral_oracle_feed_id: [u8; 32]` and `loan_oracle_feed_id: [u8; 32]`. All-zeros loan feed = assume $1 (stablecoin shortcut).

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
| 1 | Core Anchor program | In progress (Day 1 done) |
| 2 | Polish + devnet deploy | Pending |
| 3 | TypeScript SDK + Next.js frontend | Pending |
| 4 | Flash loans + liquidation bot + demo prep | Pending |
| 5 | Demo video + submit | Pending |

### Day-by-Day (Week 1)

- [x] **Day 1** — Math (wad, shares, interest), state structs, admin + market + position instructions, `anchor build` green
- [x] **Day 2** — supply_collateral, withdraw_collateral, StaticOracle (localnet)
- [x] **Day 3** — supply, withdraw (lender), share accounting, accrue_interest crank
- [x] **Day 4** — borrow, repay (with health check via StaticOracle)
- [x] **Day 5** — liquidate (LIF calc, bad debt socialization), full instruction surface complete
- [x] **Day 6** — 19/19 integration tests passing (full flow + flash loans + liquidation)

### Week 2 Progress

- [x] TypeScript SDK (`sdk/src/`) — NucleusClient, PDA helpers, math utils, APY calculations
- [x] Demo scripts (`scripts/`) — setup-demo-markets.ts, fund-demo.ts, liquidation-bot.ts
- [x] Next.js frontend (`app/`) — markets, positions, create, home pages with live chain data hooks
- [ ] Devnet deployment — needs disk space freed first (disk at 99%)
- [ ] Vercel deployment — after devnet deploy

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
BDZo1obAjSPufJsRqJmBy82whgQfedDXnTDipdA2nCVn  (devnet placeholder — regenerate before deploy)
```

---

## Deployment Checklist

### Step 1: Free disk space (disk is at 99%)

```bash
# Check what's large
du -sh ~/Library/Caches ~/Library/Developer/Xcode ~/Downloads 2>/dev/null | sort -rh | head -10
# Remove Xcode caches if not needed
rm -rf ~/Library/Developer/Xcode/DerivedData
```

### Step 2: Install app dependencies

```bash
cd app && npm install
```

### Step 3: Deploy program to devnet

```bash
# Generate a new keypair for devnet (one-time)
solana-keygen new --outfile ~/.config/solana/id.json
# Fund with devnet SOL
solana airdrop 5 --url devnet

# Build + deploy
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
~/.cargo/bin/anchor build
~/.cargo/bin/anchor deploy --provider.cluster devnet
```

**After deploy:** Update `declare_id!()` in `programs/nucleus/src/lib.rs` and `PROGRAM_ID` in:
- `sdk/src/constants.ts`
- `app/src/lib/constants.ts`
- `Anchor.toml` `[programs.devnet]`

### Step 4: Create demo markets

```bash
export HELIUS_RPC_URL="your_helius_rpc_key_here"
npx ts-node --project tsconfig.json scripts/setup-demo-markets.ts --cluster=devnet
npx ts-node --project tsconfig.json scripts/fund-demo.ts --cluster=devnet
```

### Step 5: Deploy frontend to Vercel

```bash
cd app
# Set env var for Helius RPC
echo "NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY" > .env.local

# Build locally to verify
npm run build

# Deploy
npx vercel --prod
```

### Step 6: Start liquidation bot

```bash
# Run in background to keep positions healthy for demo
npx ts-node --project tsconfig.json scripts/liquidation-bot.ts --cluster=devnet &
```
