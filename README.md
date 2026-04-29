# Paralend

**Credit for prediction markets on Solana.** Borrow USDC against your
tokenized Kalshi YES/NO positions at a time-decayed LLTV; repay or let
the force-close window settle the position before resolution.

[Program on devnet](https://explorer.solana.com/address/2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8?cluster=devnet)
· [Deployment runbook](./DEPLOYMENT.md)
· [Testing guide](./TESTING.md)

---

## Why it exists

Kalshi tokenized thousands of prediction markets on Solana in December
2025 via DFlow. Combined with Polymarket that's **$20B+ of open
event-positions** sitting as SPL tokens, **0 % of which is borrowable**.
Today a prediction-market trader who wants to deploy capital elsewhere
has to close their position and eat the spread; with Paralend they
post it as collateral and keep the thesis.

Five mechanisms specific to this asset class that don't exist in
Kamino or Jupiter Lend:

1. **Time-decay LLTV** — safety margin linearly tightens to zero over
   the final 7 days before an event resolves (capped at 70 % for
   binary-outcome collateral regardless of market config).
2. **Force-close window** — any liquidator can close unhealthy
   positions in `[T−2h, T)` for a bounty that scales 0.5 % → 3 %.
3. **Resolution handler** — attester flips the market to Resolved with
   the Kalshi outcome bit; interest freezes; bad debt socialized.
4. **Crank-attested PriceCache** — per-market PDA, EMA-smoothed,
   ±5 % deviation band bound against both `last_spot` and `ema` to
   prevent ratcheted manipulation; `rotate_attester` for key recovery.
5. **POST_BORROW_CUTOFF** — new borrows rejected in the final 30 min
   before resolution regardless of LLTV.

## Status

| Layer                            | State                                                                       |
| -------------------------------- | --------------------------------------------------------------------------- |
| Anchor program (25 instructions) | Deployed on Solana **devnet**                                               |
| Rust unit tests                  | 37 / 37 passing                                                             |
| Integration tests                | 10 / 10 passing                                                             |
| TypeScript SDK                   | 25 methods (1:1 parity with program)                                        |
| Frontend (Next.js 14)            | Landing, markets list, market detail with live decay chart + countdown      |
| Operator scripts                 | setup · fund · attester · force-close bot · resolve-market · mint-to-wallet |
| Live seeded markets              | 3 DFlow/Kalshi markets mirrored on devnet                                   |

**Devnet Program ID:** `2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8`

## Architecture

```
  user (Phantom)
     │ deposit YES/NO · borrow USDC
     ▼
  Paralend program on Solana
     ├── Market (per Kalshi event — resolution_timestamp, kalshi_ticker, base_lltv)
     ├── Position (per user, per market — collateral + borrow shares)
     ├── PriceCache (per-market attested EMA, deviation-banded)
     ├── LinearIrm (kinked-curve interest model)
     └── ProtocolState (singleton — owner, attester, LLTV + IRM allowlist)

  ← Source-venue settlement          ← spot reads via off-chain attester
    (DFlow/Kalshi outcome path)         (devnet mirrors live DFlow/Kalshi spots)
```

Source: `programs/paralend/src/`. Full module tree in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Quick start

```bash
# Build program + run the full test suite
anchor build
cargo test --manifest-path programs/paralend/Cargo.toml --lib   # 37/37
anchor test                                                      # 10/10

# Ship it to devnet (needs ~5 SOL in the upgrade-authority wallet)
anchor deploy --provider.cluster devnet

# Seed live DFlow markets + attester + liquidity
npx ts-node --project tsconfig.json scripts/setup-devnet-markets.ts --cluster=devnet
npx ts-node --project tsconfig.json scripts/fund-devnet.ts         --cluster=devnet
npx ts-node --project tsconfig.json scripts/attester.ts          --cluster=devnet --interval=20
npm run check-devnet

# Run the frontend in production mode
npm run app:build
npm run app:start
```

Full walkthrough: [TESTING.md](./TESTING.md).

## Building this for Colosseum Frontier 2026

Paralend was built during the Frontier Hackathon window (Apr 6 – May 11, 2026) after pivoting from a generic isolated-lending clone (Nucleus) on
day three once it was clear Kamino + Jupiter Lend had that space
locked. The pivot recognized three things the market was telling us:

- Kalshi's Solana tokenization is 4 months old — fresh substrate,
  no incumbent.
- Frontier's last three Grand Champions (Unruggable, Reflect, Ore)
  and every Cypherpunk DeFi track winner (Yumi, Kormos, Legasi, Pencil)
  were **specialized lending verticals**, not generic primitives.
- Phantom + Jupiter both integrated prediction markets into their
  existing products in late 2025 — distribution exists for a credit
  layer on top.

## License

MIT. See `LICENSE`.
