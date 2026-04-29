# Testing Paralend on devnet

End-to-end walk-through for exercising the live devnet deployment with
DFlow/Kalshi market metadata and attested live bid prices.

**Program**: `2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8`
**RPC**: `https://api.devnet.solana.com` or a Helius devnet URL
**Live markets**: the current entries in `app/src/lib/market-registry.json`

---

## Prerequisites

1. Install Phantom and switch it to **Devnet**.
2. Fund your wallet with devnet SOL:
   ```bash
   solana airdrop 1 <YOUR_PHANTOM_ADDRESS> --url devnet
   ```
3. Build the project:
   ```bash
   anchor build
   npx tsc --noEmit --project tsconfig.json
   cd app && npm install && npm run build
   ```

---

## 1 · Mint devnet assets to your wallet

The devnet deployment mirrors real DFlow/Kalshi market identity and live
prices, but uses devnet SPL mints so Phantom can transact on devnet.

```bash
env ANCHOR_WALLET="$HOME/.config/solana/honorary-position-devnet.json" \
  npx ts-node --project tsconfig.json \
  scripts/mint-to-wallet.ts \
  --cluster=devnet \
  --to=<YOUR_PHANTOM_ADDRESS>
```

You should receive devnet USDC plus the current registry outcome tokens.

---

## 2 · Keep the attester running

Borrow, withdraw-under-debt, and liquidate require a fresh PriceCache update.

```bash
env ANCHOR_WALLET="$HOME/.config/solana/honorary-position-devnet.json" \
  npx ts-node --project tsconfig.json \
  scripts/attester.ts --cluster=devnet --interval=20
```

Expected output:

```text
[attester] KXALIENS-27 YES: bid $0.2050, ask $0.2060, cache 0.2050 -> $0.2050 (tx ...)
```

Leave this process open during testing.

---

## 3 · Start the frontend

```bash
cd app
npm run build
npm run start
```

Open `http://localhost:3000` in the browser profile where Phantom is installed.

---

## 4 · Verify markets

1. Connect Phantom.
2. Open `/markets`.
3. Confirm the page shows exactly the current registry markets, pool size,
   borrowed amount, utilization, APY, and time-decayed borrow power.
4. Open a market detail page and confirm the action tabs render:
   **Borrow**, **Earn**, and **Collateral**.

---

## 5 · Supply, borrow, repay, withdraw

1. On a market detail page, open **Earn** and supply a small USDC amount.
2. Open **Collateral** and deposit outcome tokens.
3. Open **Borrow** and borrow well below the displayed capacity.
4. Repay the debt.
5. Withdraw collateral and supplied USDC.

Expected behavior:

- Transactions confirm on devnet.
- Health factor updates after borrow/repay.
- The borrow button disables when the preview would violate current LLTV.
- If the attester is stopped for more than `MAX_ORACLE_AGE`, borrow paths
  revert with `OraclePriceStale`.

---

## 6 · Force-close and resolution paths

For markets inside the final two-hour window:

```bash
npx ts-node --project tsconfig.json scripts/force-close-bot.ts --cluster=devnet --interval=30
```

For resolved markets:

```bash
npx ts-node --project tsconfig.json scripts/resolve-market.ts --cluster=devnet
```

Both instructions are still guarded by the program: attempts outside the
valid timing/health conditions revert.

---

## Common issues

| Symptom               | Fix                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `OraclePriceStale`    | Restart `scripts/attester.ts` and wait for a fresh tx.                                         |
| `Insufficient funds`  | Airdrop devnet SOL and confirm token balances.                                                 |
| Empty markets page    | Check `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_PROGRAM_ID`, and `app/src/lib/market-registry.json`. |
| Phantom wrong network | Switch Phantom to Devnet.                                                                      |
| Borrow disabled       | The previewed amount violates current effective LLTV or the market is near resolution.         |

---

## Submission recording checklist

- `/markets` with the three live registry markets.
- The detail-page decay chart and current borrow power.
- One confirmed USDC supply transaction.
- One confirmed collateral deposit and borrow transaction.
- Attester terminal showing live DFlow bid/ask attestations.
