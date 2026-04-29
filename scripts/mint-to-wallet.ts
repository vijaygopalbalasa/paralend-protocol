// scripts/mint-to-wallet.ts — seed your own Phantom wallet with test USDC +
// YES tokens so you can exercise the full Paralend UI on devnet.
//
// Usage:
//   npx ts-node --project tsconfig.json scripts/mint-to-wallet.ts \
//     --cluster=devnet --to=<YOUR_PHANTOM_ADDRESS>
//
// Mints:
//   - 10,000 USDC (devnet mint) → for supplying liquidity
//   - 2,000 of each live DFlow YES outcome token → for borrowing
//
// Requires the deploy wallet (the mint authority) — same keypair that ran
// scripts/setup-devnet-markets.ts. That's normally
// `~/.config/solana/honorary-position-devnet.json` or whatever your
// `ANCHOR_WALLET` env var points to.

import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  DEVNET_MINTS_PATH,
  DevnetMintsFile,
  makeProvider,
  parseClusterArg,
  readJsonFile,
} from "./devnet-common";

function parseArg(name: string): string | null {
  const raw = process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.split("=")[1] ?? null : null;
}

async function main(): Promise<void> {
  const cluster = parseClusterArg();
  const targetAddr = parseArg("to");
  if (!targetAddr) {
    throw new Error(
      "Pass --to=<pubkey>. This is usually your Phantom wallet address on devnet.\n" +
        "Copy it from Phantom → click the wallet name → copy."
    );
  }
  const target = new PublicKey(targetAddr);

  const mints = readJsonFile<DevnetMintsFile>(DEVNET_MINTS_PATH);
  if (!mints) {
    throw new Error(
      "Missing scripts/devnet-mints.json — run setup-devnet-markets.ts first."
    );
  }

  const { connection, payer } = makeProvider(cluster);
  console.log(`\n💸 Minting devnet tokens → ${target.toBase58()}`);
  console.log(`   Cluster:  ${cluster}`);
  console.log(`   Payer:    ${payer.publicKey.toBase58()} (mint authority)`);

  // 1. USDC — 10,000 units at 6 decimals = 10_000 * 1e6
  const usdcMint = new PublicKey(mints.usdc);
  const usdcAmount = 10_000n * 1_000_000n;
  {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      usdcMint,
      target
    );
    await mintTo(connection, payer, usdcMint, ata.address, payer, usdcAmount);
    console.log(
      `   ✓ Minted 10,000 USDC → ${ata.address.toBase58().slice(0, 12)}…`
    );
  }

  // 2. YES tokens for each market — 2,000 units at 6 decimals
  const yesAmount = 2_000n * 1_000_000n;
  for (const [key, mintStr] of Object.entries(mints.collateral)) {
    const mint = new PublicKey(mintStr);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      target
    );
    await mintTo(connection, payer, mint, ata.address, payer, yesAmount);
    console.log(
      `   ✓ Minted 2,000 ${key} YES → ${ata.address.toBase58().slice(0, 12)}…`
    );
  }

  console.log(`\n✅ Done. Open Phantom (devnet), refresh — you should now see`);
  console.log(`   10,000 USDC + 2,000 YES of each market in the token list.`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});

export {};
