// scripts/force-close-bot.ts — Paralend force-close watcher.
//
// Polls every `--interval` seconds (default 30). For each market whose
// `resolution_timestamp` is inside the 2h force-close window, it fetches
// every Position in that market and calls `force_close_position` for any
// that are unhealthy under the time-decayed LLTV.
//
// The program's `force_close_position` instruction itself enforces the
// window + health check, so this daemon can optimistically send txs and
// let the program reject the ones that shouldn't run.
//
// Usage:
//   npx ts-node --project tsconfig.json scripts/force-close-bot.ts [--cluster=devnet] [--interval=30] [--once]

import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  DEVNET_DEPLOYMENT_PATH,
  DevnetDeploymentFile,
  deriveCollateralVault,
  deriveLoanVault,
  derivePriceCache,
  makeProgram,
  makeProvider,
  parseClusterArg,
  PROGRAM_ID,
  readJsonFile,
} from "./devnet-common";

const args = process.argv.slice(2);
const intervalArg = args.find((a) => a.startsWith("--interval="));
const once = args.includes("--once");
const intervalSeconds = Math.max(
  10,
  Number.parseInt(intervalArg?.split("=")[1] ?? "30", 10)
);

const FORCE_CLOSE_WINDOW_SECONDS = 7_200;

async function tick(
  program: ReturnType<typeof makeProgram>,
  deployment: DevnetDeploymentFile,
  liquidatorPubkey: PublicKey
): Promise<void> {
  const methods = program.methods as any;
  const now = Math.floor(Date.now() / 1000);

  for (const m of Object.values(deployment.markets)) {
    const remaining = m.resolutionTimestamp - now;
    if (remaining <= 0) continue;
    if (remaining > FORCE_CLOSE_WINDOW_SECONDS) continue;

    const marketId = Buffer.from(m.marketId, "hex");
    const marketPk = new PublicKey(m.market);
    const positions = await (program.account as any).position.all([
      {
        memcmp: {
          // Position layout: 8 (disc) + 1 (bump) + 32 (market_id) = offset 41 for owner.
          // We instead filter by market_id at offset 9.
          offset: 9,
          bytes: new PublicKey(Buffer.concat([marketId])).toBase58(), // coerce via PublicKey
        },
      },
    ]).catch(() => []);

    for (const entry of positions) {
      const pos = entry.account;
      const collateral = BigInt(pos.collateral.toString());
      const borrowShares = BigInt(pos.borrowShares.toString());
      if (collateral === 0n || borrowShares === 0n) continue;

      const owner = pos.owner as PublicKey;
      try {
        const sig = await methods
          .forceClosePosition(Array.from(marketId))
          .accountsPartial({
            liquidator: liquidatorPubkey,
            market: marketPk,
            irm: new PublicKey(m.irm),
            borrowerPosition: entry.publicKey,
            borrower: owner,
            liquidatorLoanAta: getAssociatedTokenAddressSync(
              new PublicKey(m.loanMint),
              liquidatorPubkey
            ),
            loanVault: deriveLoanVault(marketId),
            collateralVault: deriveCollateralVault(marketId),
            liquidatorCollateralAta: getAssociatedTokenAddressSync(
              new PublicKey(m.collateralMint),
              liquidatorPubkey
            ),
            priceCache: derivePriceCache(marketId),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        console.log(
          `[force-close] ${m.kalshiTicker}: closed ${owner.toBase58().slice(0, 8)}… (tx ${sig.slice(0, 12)}…)`
        );
      } catch (err) {
        const msg = (err as Error).message;
        // Silence noisy "still healthy" rejections — expected when positions
        // are inside the window but still above effective LLTV.
        if (!msg.includes("PositionHealthy")) {
          console.warn(
            `[force-close] ${m.kalshiTicker} / ${owner.toBase58().slice(0, 8)}…: ${msg}`
          );
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const cluster = parseClusterArg();
  const { provider, payer } = makeProvider(cluster);
  const program = makeProgram(provider);

  const deployment = readJsonFile<DevnetDeploymentFile>(DEVNET_DEPLOYMENT_PATH);
  if (!deployment) {
    throw new Error(
      "Missing devnet-deployment.json — run scripts/setup-devnet-markets.ts first."
    );
  }

  console.log(`\n⚖️  Paralend force-close watcher`);
  console.log(`   Cluster:    ${cluster}`);
  console.log(`   Program:    ${PROGRAM_ID.toBase58()}`);
  console.log(`   Liquidator: ${payer.publicKey.toBase58()}`);
  console.log(`   Interval:   ${intervalSeconds}s`);
  console.log(`   Mode:       ${once ? "one-shot" : "continuous"}\n`);

  await tick(program, deployment, payer.publicKey);
  if (once) return;

  // eslint-disable-next-line @typescript-eslint/no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
    await tick(program, deployment, payer.publicKey);
  }
}

main().catch((error) => {
  console.error("❌ Force-close watcher fatal:", error);
  process.exit(1);
});
