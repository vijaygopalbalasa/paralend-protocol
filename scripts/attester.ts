// scripts/attester.ts — Paralend price-attester daemon.
//
// Every `--interval` seconds (default 20) it reads each market's PriceCache,
// fetches a live DFlow bid for the market outcome, and submits `attest_price`
// via the attester keypair persisted during setup. The Rust side still
// enforces MAX_PRICE_DEVIATION_BPS = 500, so a bad feed update cannot move the
// cached price outside the on-chain guardrail in one call.
//
// Usage:
//   npx ts-node --project tsconfig.json scripts/attester.ts [--cluster=devnet] [--interval=20] [--once]

import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";

import {
  DEVNET_ATTESTER_PATH,
  DEVNET_DEPLOYMENT_PATH,
  DevnetAttesterFile,
  DevnetDeploymentFile,
  boundedOraclePrice,
  deriveMarket,
  derivePriceCache,
  makeProgram,
  makeProvider,
  parseClusterArg,
  PROGRAM_ID,
  readJsonFile,
} from "./devnet-common";
import { fetchDflowSpot } from "./dflow";

const args = process.argv.slice(2);
const intervalArg = args.find((a) => a.startsWith("--interval="));
const once = args.includes("--once");
const intervalSeconds = Math.max(
  5,
  Number.parseInt(intervalArg?.split("=")[1] ?? "20", 10)
);

async function tick(
  program: ReturnType<typeof makeProgram>,
  attester: Keypair,
  deployment: DevnetDeploymentFile
): Promise<void> {
  const methods = program.methods as any;

  for (const m of Object.values(deployment.markets)) {
    const marketId = Buffer.from(m.marketId, "hex");
    const market = deriveMarket(marketId);
    const priceCache = derivePriceCache(marketId);

    let lastSpot: bigint;
    let emaPrice: bigint;
    try {
      const cache = await (program.account as any).priceCache.fetch(priceCache);
      lastSpot = BigInt(cache.lastSpotWad.toString());
      emaPrice = BigInt(cache.emaPriceWad.toString());
    } catch (err) {
      console.warn(
        `[attester] ${m.kalshiTicker}: PriceCache not found (${
          (err as Error).message
        }) — skipping.`
      );
      continue;
    }

    let spot;
    try {
      spot = await fetchDflowSpot(m);
    } catch (err) {
      console.warn(
        `[attester] ${m.kalshiTicker}: live DFlow price unavailable — ${
          (err as Error).message
        }`
      );
      continue;
    }

    const submittedPriceWad = boundedOraclePrice({
      livePriceWad: spot.priceWad,
      lastSpotWad: lastSpot,
      emaPriceWad: emaPrice,
    });
    const submittedPriceUsd =
      (Number(submittedPriceWad) * 10 ** m.collateralDecimals) / 1e18;
    const bridged = submittedPriceWad !== spot.priceWad;

    try {
      const sig = await methods
        .attestPrice(Array.from(marketId), new BN(submittedPriceWad.toString()))
        .accountsPartial({ attester: attester.publicKey, market, priceCache })
        .signers([attester])
        .rpc();
      console.log(
        `[attester] ${m.kalshiTicker} ${spot.side}: bid $${spot.bid.toFixed(
          4
        )}, ask $${spot.ask.toFixed(4)}, cache ${(
          Number(lastSpot) / 1e12
        ).toFixed(4)} → $${submittedPriceUsd.toFixed(4)}${
          bridged ? " bounded toward live" : ""
        } (tx ${sig.slice(0, 12)}...)`
      );
    } catch (err) {
      console.warn(
        `[attester] ${m.kalshiTicker}: attest failed — ${
          (err as Error).message
        }`
      );
    }
  }
}

async function main(): Promise<void> {
  const cluster = parseClusterArg();
  const { connection, provider } = makeProvider(cluster);
  const program = makeProgram(provider);

  const attesterFile = readJsonFile<DevnetAttesterFile>(DEVNET_ATTESTER_PATH);
  if (!attesterFile) {
    throw new Error(
      "Missing devnet-attester.json — run scripts/setup-devnet-markets.ts first."
    );
  }
  const attester = Keypair.fromSecretKey(
    Uint8Array.from(attesterFile.secretKey)
  );

  const deployment = readJsonFile<DevnetDeploymentFile>(DEVNET_DEPLOYMENT_PATH);
  if (!deployment) {
    throw new Error(
      "Missing devnet-deployment.json — run scripts/setup-devnet-markets.ts first."
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
