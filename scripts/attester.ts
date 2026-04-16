// scripts/attester.ts — Paralend price-attester daemon.
//
// Every `--interval` seconds (default 20) it reads each market's PriceCache,
// samples a synthetic Kalshi-API-style spot (for devnet demo: random walk
// capped to the 5 % deviation band around last_spot), and submits
// `attest_price` via the attester keypair persisted during setup.
//
// In production this would pull `yesBid`/`yesAsk` from Kalshi's public REST
// API. For the hackathon devnet demo we random-walk inside the band so the
// EMA curve on the UI is lively. The Rust side still enforces
// MAX_PRICE_DEVIATION_BPS = 500 regardless of what this daemon posts, so
// there's no way for a buggy attester to zero the price in one call.
//
// Usage:
//   npx ts-node --project tsconfig.json scripts/attester.ts [--cluster=devnet] [--interval=20] [--once]

import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";

import {
  DEMO_ATTESTER_PATH,
  DEMO_DEPLOYMENT_PATH,
  DemoAttesterFile,
  DemoDeploymentFile,
  derivePriceCache,
  makeProgram,
  makeProvider,
  parseClusterArg,
  PROGRAM_ID,
  readJsonFile,
} from "./demo-common";

const args = process.argv.slice(2);
const intervalArg = args.find((a) => a.startsWith("--interval="));
const once = args.includes("--once");
const intervalSeconds = Math.max(
  5,
  Number.parseInt(intervalArg?.split("=")[1] ?? "20", 10)
);

const MAX_DEVIATION_BPS = 500n; // matches on-chain MAX_PRICE_DEVIATION_BPS
const TARGET_MOVE_BPS = 150n; // ±1.5% random walk per tick — well inside the band

function sampleSpot(
  lastSpotWad: bigint,
  initialPriceWad: bigint
): bigint {
  // Gentle random walk, biased slightly toward the initialPriceWad so the
  // EMA doesn't wander off to ~0 or ~1 on long-running demos.
  const drift = (initialPriceWad - lastSpotWad) / 200n; // 0.5% pull-back per tick
  const randomBps =
    BigInt(Math.floor((Math.random() - 0.5) * 2 * Number(TARGET_MOVE_BPS))); // ± TARGET_MOVE_BPS
  const delta = (lastSpotWad * randomBps) / 10_000n + drift;

  // Clamp to ±(MAX_DEVIATION_BPS - 50) bps so we always stay well inside
  // the on-chain band.
  const maxDelta = (lastSpotWad * (MAX_DEVIATION_BPS - 50n)) / 10_000n;
  const clamped =
    delta > maxDelta ? maxDelta : delta < -maxDelta ? -maxDelta : delta;

  let next = lastSpotWad + clamped;
  if (next <= 0n) next = 1n;
  // YES/NO shares are bounded in (0, 1) USD — price_wad bounds depend on
  // decimals. For 6-decimal tokens, max price_wad = 1e18 / 1e6 = 1e12.
  const ONE_USD_WAD = 1_000_000_000_000n; // 1 USD per 6-decimal base unit
  if (next > ONE_USD_WAD) next = ONE_USD_WAD;
  return next;
}

async function tick(
  program: ReturnType<typeof makeProgram>,
  attester: Keypair,
  deployment: DemoDeploymentFile
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods = program.methods as any;
  const initialBy: Record<string, bigint> = {};
  for (const m of Object.values(deployment.markets)) {
    // Initial spot = initialPriceUsd converted to WAD.
    initialBy[m.market] = BigInt(
      Math.round(m.initialPriceUsd * 1_000_000_000_000)
    );
  }

  for (const m of Object.values(deployment.markets)) {
    const marketId = Buffer.from(m.marketId, "hex");
    const priceCache = derivePriceCache(marketId);

    let lastSpot: bigint;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cache = await (program.account as any).priceCache.fetch(priceCache);
      lastSpot = BigInt(cache.lastSpotWad.toString());
    } catch (err) {
      console.warn(
        `[attester] ${m.kalshiTicker}: PriceCache not found (${(err as Error).message}) — skipping.`
      );
      continue;
    }

    const nextSpot = sampleSpot(lastSpot, initialBy[m.market]);
    try {
      const sig = await methods
        .attestPrice(Array.from(marketId), new BN(nextSpot.toString()))
        .accountsPartial({ attester: attester.publicKey, priceCache })
        .signers([attester])
        .rpc();
      console.log(
        `[attester] ${m.kalshiTicker}: spot ${(Number(lastSpot) / 1e12).toFixed(4)} → ${(Number(nextSpot) / 1e12).toFixed(4)} (tx ${sig.slice(0, 12)}…)`
      );
    } catch (err) {
      console.warn(
        `[attester] ${m.kalshiTicker}: attest failed — ${(err as Error).message}`
      );
    }
  }
}

async function main(): Promise<void> {
  const cluster = parseClusterArg();
  const { connection, provider } = makeProvider(cluster);
  const program = makeProgram(provider);

  const attesterFile = readJsonFile<DemoAttesterFile>(DEMO_ATTESTER_PATH);
  if (!attesterFile) {
    throw new Error(
      "Missing demo-attester.json — run scripts/setup-demo-markets.ts first."
    );
  }
  const attester = Keypair.fromSecretKey(
    Uint8Array.from(attesterFile.secretKey)
  );

  const deployment = readJsonFile<DemoDeploymentFile>(DEMO_DEPLOYMENT_PATH);
  if (!deployment) {
    throw new Error(
      "Missing demo-deployment.json — run scripts/setup-demo-markets.ts first."
    );
  }

  console.log(`\n📡 Paralend attester daemon`);
  console.log(`   Cluster:   ${cluster}`);
  console.log(`   RPC:       ${connection.rpcEndpoint}`);
  console.log(`   Program:   ${PROGRAM_ID.toBase58()}`);
  console.log(`   Attester:  ${attester.publicKey.toBase58()}`);
  console.log(`   Markets:   ${Object.keys(deployment.markets).length}`);
  console.log(`   Interval:  ${intervalSeconds}s`);
  console.log(`   Mode:      ${once ? "one-shot" : "continuous"}\n`);

  await tick(program, attester, deployment);

  if (once) return;

  // eslint-disable-next-line @typescript-eslint/no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
    await tick(program, attester, deployment);
  }
}

main().catch((error) => {
  console.error("❌ Attester fatal:", error);
  process.exit(1);
});
