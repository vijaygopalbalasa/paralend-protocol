// scripts/check-devnet-health.ts — read-only deployment readiness check.
//
// Verifies that the local registry/deployment artifacts agree with the
// deployed program and that every PriceCache has a recent attestation.
//
// Usage:
//   npx ts-node --project tsconfig.json scripts/check-devnet-health.ts --cluster=devnet

import {
  APP_MARKET_REGISTRY_PATH,
  DEVNET_DEPLOYMENT_PATH,
  DevnetDeploymentFile,
  deriveMarket,
  derivePriceCache,
  makeProgram,
  makeReadOnlyProvider,
  parseClusterArg,
  PROGRAM_ID,
  readJsonFile,
} from "./devnet-common";

interface MarketRegistryFile {
  generatedAt: string;
  programId: string;
  markets: Record<
    string,
    {
      priceCache: string;
      kalshiTicker: string;
    }
  >;
}

function intArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number.parseInt(value.slice(prefix.length), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const cluster = parseClusterArg();
  const maxAgeSeconds = intArg("max-age", 60);
  const { connection, provider } = makeReadOnlyProvider(cluster);
  const program = makeProgram(provider);

  const deployment = readJsonFile<DevnetDeploymentFile>(DEVNET_DEPLOYMENT_PATH);
  if (!deployment) fail("Missing scripts/devnet-deployment.json");
  if (deployment.programId !== PROGRAM_ID.toBase58()) {
    fail(
      `Deployment program ${
        deployment.programId
      } does not match SDK ${PROGRAM_ID.toBase58()}`
    );
  }

  const registry = readJsonFile<MarketRegistryFile>(APP_MARKET_REGISTRY_PATH);
  if (!registry) fail("Missing app/src/lib/market-registry.json");
  if (registry.programId !== PROGRAM_ID.toBase58()) {
    fail(
      `Registry program ${
        registry.programId
      } does not match SDK ${PROGRAM_ID.toBase58()}`
    );
  }

  const chainSlot = await connection.getSlot("confirmed");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const registryMarkets = new Map(
    Object.entries(registry.markets).map(([marketAddress, market]) => [
      marketAddress,
      market,
    ])
  );

  console.log("\nParalend devnet health");
  console.log(`  Cluster:   ${cluster}`);
  console.log(`  RPC:       ${connection.rpcEndpoint}`);
  console.log(`  Program:   ${PROGRAM_ID.toBase58()}`);
  console.log(`  Slot:      ${chainSlot}`);
  console.log(`  Markets:   ${Object.keys(deployment.markets).length}`);
  console.log(`  Max age:   ${maxAgeSeconds}s\n`);

  const failures: string[] = [];

  for (const market of Object.values(deployment.markets)) {
    const marketId = Buffer.from(market.marketId, "hex");
    const expectedMarket = deriveMarket(marketId).toBase58();
    const expectedCache = derivePriceCache(marketId).toBase58();
    const registryEntry = registryMarkets.get(market.market);

    if (!registryEntry) failures.push(`${market.key}: missing from registry`);
    if (market.market !== expectedMarket) {
      failures.push(`${market.key}: deployment market PDA mismatch`);
    }
    if (market.priceCache !== expectedCache) {
      failures.push(`${market.key}: deployment PriceCache PDA mismatch`);
    }
    if (registryEntry?.priceCache !== market.priceCache) {
      failures.push(
        `${market.key}: registry PriceCache differs from deployment`
      );
    }

    try {
      await (program.account as any).market.fetch(expectedMarket);
    } catch (err) {
      failures.push(
        `${market.key}: market account missing (${(err as Error).message})`
      );
      continue;
    }

    try {
      const cache = await (program.account as any).priceCache.fetch(
        expectedCache
      );
      const lastUpdateTs = Number(cache.lastUpdateTs.toString());
      const age = nowSeconds - lastUpdateTs;
      const ema = BigInt(cache.emaPriceWad.toString());
      const lastSpot = BigInt(cache.lastSpotWad.toString());

      if (ema <= 0n || lastSpot <= 0n) {
        failures.push(`${market.key}: non-positive oracle cache`);
      }
      if (age < 0 || age > maxAgeSeconds) {
        failures.push(
          `${market.key}: oracle age ${age}s exceeds ${maxAgeSeconds}s`
        );
      }

      console.log(
        `  ${market.kalshiTicker.padEnd(18)} age=${String(age).padStart(
          3
        )}s ema=$${(Number(ema) / 1e12).toFixed(4)}`
      );
    } catch (err) {
      failures.push(
        `${market.key}: PriceCache missing (${(err as Error).message})`
      );
    }
  }

  if (failures.length > 0) {
    console.error("\nHealth check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("\n✓ Devnet deployment is coherent and oracle caches are fresh.");
}

main().catch((error) => {
  console.error("✗ Health check fatal:", error);
  process.exit(1);
});
