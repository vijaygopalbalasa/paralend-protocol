# Paralend — devnet deployment runbook

End-to-end procedure for taking the Paralend program from the repo to a
live, interactive devnet deployment with seeded markets, liquidity, and
a running price attester daemon.

Time to complete (cold start): ~15 min walltime, ~5 min active time.

---

## 1 · Prerequisites

```bash
solana --version     # agave-cli 3.1.12
anchor --version     # anchor-cli 0.31.1
node --version       # 20.x
```

If missing:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"   # agave / solana CLI
cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install 0.31.1 && avm use 0.31.1
```

Set the Solana CLI to devnet:

```bash
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/honorary-position-devnet.json   # or wherever your deploy wallet lives
```

---

## 2 · Fund the deploy wallet (~5 SOL)

The program binary is ~676 KB, so deployment costs about **4.9 SOL**:

```bash
solana balance --url devnet
# If < 5 SOL:
solana airdrop 2 --url devnet    # retry in a minute if rate-limited
# Or use https://faucet.solana.com (paste your pubkey from `solana address`)
```

---

## 3 · Build

```bash
anchor build
# → target/deploy/paralend.so        (program binary)
# → target/deploy/paralend-keypair.json  (program keypair; declare_id! must match)
# → target/idl/paralend.json
# → target/types/paralend.ts
```

The committed `declare_id!` is `2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8`.
If `target/deploy/paralend-keypair.json` was regenerated, either restore
the committed keypair or update `declare_id!` + `Anchor.toml` to match
the new pubkey, then rebuild.

---

## 4 · Deploy

```bash
anchor deploy --provider.cluster devnet
```

Expected output ends with:

```
Program Id: 2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8
Deploy success
```

---

## 5 · Sync the IDL into the frontend

```bash
cp target/idl/paralend.json       app/src/lib/paralend-idl.json
cp target/types/paralend.ts       app/src/lib/paralend-idl-types.ts
```

(Done automatically by `scripts/setup-devnet-markets.ts` on every run — this
step is only needed if you deploy without seeding live market mirrors.)

---

## 6 · Seed live devnet markets

Loads active DFlow/Kalshi binary markets, mirrors their metadata/prices to
devnet SPL collateral mints, and registers one PriceCache per market:

```bash
npx ts-node --project tsconfig.json scripts/setup-devnet-markets.ts --cluster=devnet
```

Artifacts written:

| File                               | Purpose                                  |
| ---------------------------------- | ---------------------------------------- |
| `scripts/devnet-mints.json`        | USDC + per-market outcome mint addresses |
| `scripts/devnet-deployment.json`   | Market + IRM + PriceCache PDAs           |
| `scripts/devnet-attester.json`     | Attester keypair (**do not commit**)     |
| `app/src/lib/market-registry.json` | Frontend-visible market registry         |

---

## 7 · Seed liquidity + borrowers

Each market gets:

- 25 000 USDC supplied from the deploy wallet (lender role)
- A generated per-market borrower wallet with 500 YES tokens posted
  and a ~30 % LTV borrow drawn

```bash
npx ts-node --project tsconfig.json scripts/fund-devnet.ts --cluster=devnet
```

---

## 8 · Start the price attester daemon

Pushes a fresh `attest_price` every 20 seconds per market — the
program's EMA + ±5 % deviation band guarantees a single misbehaving
tick can't zero the price.

```bash
# One push (useful in CI or for a single readiness check):
npx ts-node --project tsconfig.json scripts/attester.ts --cluster=devnet --once

# Continuous (run in tmux / screen / systemd):
npx ts-node --project tsconfig.json scripts/attester.ts --cluster=devnet --interval=20
```

---

## 9 · Readiness check

Run this before recording or submitting. It verifies registry/deployment
consistency, on-chain market accounts, PriceCache accounts, and oracle
freshness.

```bash
npm run check-devnet
```

---

## 10 · Optional: force-close watcher

Polls every 30 s, auto-fires `force_close_position` on any unhealthy
position inside the 2-hour pre-resolution window. The program's own
checks reject still-healthy attempts, so false positives are cheap.

```bash
npx ts-node --project tsconfig.json scripts/force-close-bot.ts --cluster=devnet --interval=30
```

---

## 11 · Frontend

Point the Next.js frontend at the deployed program + devnet RPC:

```bash
cd app
export NEXT_PUBLIC_PROGRAM_ID=2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8
export NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
# Or use a Helius devnet URL with your API key:
# export NEXT_PUBLIC_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
npm install
npm run build    # sanity check
npm run dev      # local preview on http://localhost:3000
# Or deploy to Vercel:
# vercel env add NEXT_PUBLIC_PROGRAM_ID production
# vercel env add NEXT_PUBLIC_RPC_URL    production
# vercel --prod
```

---

## 12 · End-to-end verification

From the app UI, connect a Phantom wallet on devnet:

1. **/markets** renders all 3 seeded markets with live resolution
   countdowns + LLTV badges. Supply/Borrow APY should be non-zero
   (borrowers were seeded in step 7).
2. Click a market to open **/markets/[id]**. The `DecayCurveChart`
   component renders above the stats grid, a green "now" marker at
   the current effective LLTV, a dashed line at T-7d, and a shaded
   orange strip covering the final 2 hours.
3. `/positions` shows the connected wallet's positions (empty by
   default until you deposit). Time-aware health factor highlights
   a red zone as resolution approaches.
4. Back-end CLI check:
   ```bash
   solana program show 2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8 --url devnet
   ```
   should return a deployed, upgradable program matching the local
   keypair.

---

## 13 · Cleanup / teardown

Revoking the deploy is not usually necessary for a hackathon. If you
ever do:

```bash
solana program close 2kZNrHd7VzE...   # recovers ~4.8 SOL
```

⚠️ That deletes the program. All markets / positions / price caches
become unusable. Do **not** close while the submission deployment is still running.
