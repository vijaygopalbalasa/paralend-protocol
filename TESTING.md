# Testing Paralend on devnet

End-to-end walk-through for putting yourself in a Kalshi trader's shoes and
actually doing a supply → deposit → borrow → repay on the live devnet
deployment.

**Program**: `2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8`
**RPC**: `https://api.devnet.solana.com`
**Live markets**: 3 (BTC-150K-JUN2026, SOL-300-DEC2026, NFL-FINAL-24H)

---

## Prerequisites (5 min)

1. **Install [Phantom wallet](https://phantom.app/)** (browser extension or mobile).
2. **Switch Phantom to Devnet**: settings ⚙️ → Developer Settings → Testnet Mode → enable → select **Devnet**.
3. **Top up your Phantom with devnet SOL** for gas:
   ```bash
   solana airdrop 1 <YOUR_PHANTOM_ADDRESS> --url devnet
   # or use https://faucet.solana.com if rate-limited
   ```
4. **Make sure the repo builds locally**:
   ```bash
   cd /Users/vijaygopalb/colosseum-frontier
   anchor build                # program + IDL
   cd app && npm install       # frontend deps (first run only)
   cd ..
   ```

---

## Step 1 — Mint test tokens to your Phantom wallet (one-time, ~30 sec)

The demo markets use synthetic USDC + YES mints created during setup.
You need to mint some to your wallet before you can supply or borrow.

```bash
# copy your address from Phantom → paste into --to=
env ANCHOR_WALLET="$HOME/.config/solana/honorary-position-devnet.json" \
  npx ts-node --project tsconfig.json \
  scripts/mint-to-wallet.ts \
  --cluster=devnet \
  --to=<YOUR_PHANTOM_ADDRESS>
```

Expected output:
```
💸 Minting test tokens → <YOUR_PHANTOM_ADDRESS>
   ✓ Minted 10,000 USDC → ...
   ✓ Minted 2,000 btc-150k-jun2026 YES → ...
   ✓ Minted 2,000 sol-300-dec2026 YES → ...
   ✓ Minted 2,000 nfl-final-24h YES → ...
```

Open Phantom → refresh → you should see 10,000 USDC + 2,000 of each YES
token in your token list.

---

## Step 2 — Start the attester daemon (keep running)

Without fresh attestations, the oracle staleness guard (30 s) will reject
`borrow` / `withdraw_collateral` / `liquidate` calls. Start the attester
in a dedicated terminal and leave it running:

```bash
env ANCHOR_WALLET="$HOME/.config/solana/honorary-position-devnet.json" \
  npx ts-node --project tsconfig.json \
  scripts/attester.ts --cluster=devnet --interval=20
```

You'll see output every ~20 s:
```
[attester] BTC-150K-JUN2026: spot 0.3812 → 0.3805 (tx 4CaPs3…)
[attester] SOL-300-DEC2026: spot 0.5254 → 0.5261 (tx 21kkbj…)
[attester] NFL-FINAL-24H:    spot 0.6110 → 0.6098 (tx 2XdoDq…)
```

Leave this terminal open for the rest of the session.

---

## Step 3 — Start the frontend (keep running)

In a second terminal:

```bash
cd /Users/vijaygopalb/colosseum-frontier/app
npm run dev
```

The Next.js dev server starts at `http://localhost:3000`. Open it in a
browser where Phantom is installed (same browser profile).

---

## Step 4 — Connect wallet + browse markets

1. Click **Select Wallet** (top right) → pick Phantom → approve.
2. Navigate to `/markets`. You should see 3 rows:
   - **BTC-150K-JUN2026** with "~45d to resolution"
   - **SOL-300-DEC2026** with "~8d to resolution"
   - **NFL-FINAL-24H** with "force-close" or "cutoff" badge (it's close to resolution)
3. Each row shows live countdown + LLTV + Supply APY + Borrow APY.

**What to verify**: the countdown ticks in real time and the Kalshi ticker
displays correctly. If you see "Non-resolving" badges everywhere, the
attester isn't running — go back to Step 2.

---

## Step 5 — Supply USDC (lender flow)

1. Click any market → you're on `/markets/[id]`.
2. See the **LLTV decay curve** (SVG, above the stat cards). The green
   dot is "now" with the current effective LLTV.
3. Click the **Supply** tab.
4. Enter **100** (USDC). Click **Supply USDC**.
5. Phantom pops up → Approve.

**What to verify**:
- Tx confirms within a few seconds.
- The **TVL** stat updates.
- Your USDC balance (in Phantom) dropped by 100.
- In `useMarketDetail` polling, the **position card** shows your new
  supply shares.

Try a **Withdraw** too (same tab, bottom half) — withdraw 25 USDC to
verify the reverse works.

---

## Step 6 — Borrow against YES tokens (borrower flow) — the main demo

Pick the **SOL-300-DEC2026** market (it's ~8 days out, so you'll see
time-decay on the chart but the LLTV is still high enough to borrow).

1. Click the **Collateral** tab.
2. Deposit **500 YES** tokens. Phantom → Approve.
3. Position card now shows 500 collateral.
4. Click the **Borrow** tab.
5. The UI calculates effective LLTV + your max borrow using the exact
   same math as on-chain. Enter an amount well under the limit,
   e.g. **50** USDC.
6. Click **Borrow USDC**. Phantom → Approve.

**What to verify**:
- No orange blocker banner appears (meaning: not in the post-borrow
  cutoff, oracle is fresh, borrow is healthy).
- Tx confirms.
- Position **Outstanding debt** updates to 50.
- **Health factor** shows as a green / orange / red pill.
- Your USDC balance in Phantom went up by 50.

---

## Step 7 — Edge cases worth poking

### Try to borrow more than effective LLTV allows
Enter e.g. **500** USDC in the borrow field. The client-side health
preview should immediately show:
> Position would be unhealthy after borrow at the current effective LLTV
> (XX.X %). Reduce the amount or add more collateral.

The button disables. This is the "don't burn gas" guard.

### Watch the decay curve move
Stay on the market detail page. The green "now" dot crawls left-to-right
every few seconds. For NFL-FINAL-24H (~17 h to resolution), you can see
the effective LLTV actively decaying — this is the hero visual of the
demo.

### Hit the POST_BORROW_CUTOFF
If you pick NFL-FINAL-24H and wait long enough (or if it's already
< 30 min to resolution), the borrow tab shows:
> Borrow is paused inside the final 30 minutes before resolution.

The button disables. The force-close bot (if running) can then seize
any remaining under-water position for a bounty.

### Kill the attester, try to borrow
In the attester terminal, hit `Ctrl-C`. Wait 30 seconds. Try to borrow
again in the UI. The Phantom popup will approve but the program will
revert with **OraclePriceStale**. This is the documented failure mode —
the fix is to restart the attester.

---

## Step 8 — Repay + withdraw collateral

1. On the **Borrow** tab (bottom half), enter your debt amount → **Repay**.
2. Switch to **Collateral** tab → withdraw all YES back.
3. Position goes to zero.

---

## Common issues

| Symptom | Fix |
|---|---|
| "Insufficient funds" on borrow | Your Phantom doesn't have enough SOL for tx fees. `solana airdrop 1 <addr> --url devnet`. |
| "OraclePriceStale" | Attester isn't running. Restart `scripts/attester.ts`. |
| "MarketPaused" | You're hitting NFL-FINAL-24H after its resolution — pick a different market. |
| Decay chart doesn't render | The market has no resolution_timestamp (classical lending). Our 3 demo markets all do — if none render a chart, check the `useMarketDetail` hook for fetch errors in browser devtools. |
| "InsufficientLiquidity" on borrow | Someone already borrowed the pool. Supply more USDC first. |
| Phantom shows "wrong network" | Phantom is on mainnet — switch to Devnet in Settings → Developer. |

---

## What to watch / record for the demo video

- The **decay curve** as the hero shot (2–3 s static render)
- A live **borrow** tx with the Phantom popup → confirmation
- The **countdown** on each market row ticking in real time
- The **post-borrow-cutoff** banner (shows a market gracefully rejecting)
- A **health factor** turning red as you increase borrow amount
- The attester terminal posting prices (proof it's live data, not canned)

---

## Want to start fresh?

If you want to wipe state and re-seed 3 new markets with fresh
resolution timestamps (useful if your NFL market has already expired):

```bash
# Close the program + recover rent (DESTRUCTIVE, only if you're OK losing
# the live state and redeploying)
solana program close 2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8 --url devnet

# Then redeploy + re-seed per DEPLOYMENT.md.
```

Usually NOT needed — just `setup-demo-markets.ts` is idempotent and will
reuse existing markets. If a market resolved, pick a different one; the
other two (BTC, SOL) run for 45 + 8 days.
