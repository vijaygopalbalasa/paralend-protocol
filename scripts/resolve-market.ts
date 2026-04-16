// scripts/resolve-market.ts — manually finalise a Paralend market post-T.
//
// After `resolution_timestamp` elapses, the market attester must call
// `handle_resolution` with the actual Kalshi outcome bit (1 = YES won,
// 2 = NO won). Until this runs the market stays in Active status and
// no downstream settlement can happen.
//
// In production this would be an automation watching the Kalshi REST
// resolve endpoint; for the devnet demo it's a manual CLI invocation so
// operators can deliberately resolve markets during the recorded video.
//
// Usage:
//   npx ts-node --project tsconfig.json scripts/resolve-market.ts \
//     --cluster=devnet --market=<MARKET_KEY_OR_PUBKEY> --outcome=YES|NO

import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  DEMO_ATTESTER_PATH,
  DEMO_DEPLOYMENT_PATH,
  DemoAttesterFile,
  DemoDeploymentFile,
  deriveMarket,
  derivePriceCache,
  makeProgram,
  makeProvider,
  parseClusterArg,
  PROGRAM_ID,
  readJsonFile,
} from "./demo-common";

function parseArg(name: string): string | null {
  const raw = process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.split("=")[1] ?? null : null;
}

function resolveMarket(
  deployment: DemoDeploymentFile,
  selector: string
): { market: DemoDeploymentFile["markets"][string]; pubkey: PublicKey } {
  // Try pubkey first (exact match against map keys)
  if (deployment.markets[selector]) {
    return {
      market: deployment.markets[selector],
      pubkey: new PublicKey(selector),
    };
  }
  // Fall back to ticker / key match
  const byKey = Object.values(deployment.markets).find(
    (m) => m.key === selector || m.kalshiTicker === selector
  );
  if (byKey) {
    return { market: byKey, pubkey: new PublicKey(byKey.market) };
  }
  throw new Error(
    `No market matching "${selector}" — expected a pubkey, key, or ticker.`
  );
}

async function main(): Promise<void> {
  const cluster = parseClusterArg();
  const marketSelector = parseArg("market");
  const outcomeArg = parseArg("outcome")?.toUpperCase();

  if (!marketSelector) {
    throw new Error(
      "Pass --market=<pubkey|key|ticker>. Options:\n" +
        Object.values(
          readJsonFile<DemoDeploymentFile>(DEMO_DEPLOYMENT_PATH)?.markets ?? {}
        )
          .map((m) => `    ${m.key} (${m.kalshiTicker}) → ${m.market}`)
          .join("\n")
    );
  }
  if (outcomeArg !== "YES" && outcomeArg !== "NO") {
    throw new Error("Pass --outcome=YES or --outcome=NO");
  }
  const outcomeBit = outcomeArg === "YES" ? 1 : 2;

  const deployment = readJsonFile<DemoDeploymentFile>(DEMO_DEPLOYMENT_PATH);
  const attesterFile = readJsonFile<DemoAttesterFile>(DEMO_ATTESTER_PATH);
  if (!deployment || !attesterFile) {
    throw new Error(
      "Missing demo-deployment.json or demo-attester.json — run scripts/setup-demo-markets.ts first."
    );
  }

  const { market, pubkey } = resolveMarket(deployment, marketSelector);
  const now = Math.floor(Date.now() / 1000);
  if (now < market.resolutionTimestamp) {
    const eta = market.resolutionTimestamp - now;
    throw new Error(
      `Market ${market.kalshiTicker} doesn't resolve yet (${eta}s away).`
    );
  }

  const attester = Keypair.fromSecretKey(
    Uint8Array.from(attesterFile.secretKey)
  );
  const { provider } = makeProvider(cluster);
  const program = makeProgram(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods = program.methods as any;

  const marketIdBuf = Buffer.from(market.marketId, "hex");
  const marketPda = deriveMarket(marketIdBuf);
  const priceCachePda = derivePriceCache(marketIdBuf);

  // Sanity check — ensure the caller holds the right attester key.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache = await (program.account as any).priceCache.fetch(priceCachePda);
  if (cache.attester.toBase58() !== attester.publicKey.toBase58()) {
    throw new Error(
      `Loaded attester ${attester.publicKey.toBase58()} doesn't match the PriceCache attester ${cache.attester.toBase58()}. Did you rotate the attester?`
    );
  }

  console.log(`\n🏁 Resolving ${market.kalshiTicker}`);
  console.log(`   Cluster:     ${cluster}`);
  console.log(`   Program:     ${PROGRAM_ID.toBase58()}`);
  console.log(`   Market:      ${pubkey.toBase58()}`);
  console.log(`   Attester:    ${attester.publicKey.toBase58()}`);
  console.log(`   Outcome:     ${outcomeArg} (bit = ${outcomeBit})`);
  console.log(
    `   Resolves at: ${new Date(market.resolutionTimestamp * 1000).toISOString()}`
  );

  const sig = await methods
    .handleResolution(
      Array.from(marketIdBuf) as unknown as number[] & { length: 32 },
      outcomeBit
    )
    .accountsPartial({
      attester: attester.publicKey,
      market: marketPda,
      priceCache: priceCachePda,
    })
    .signers([attester])
    .rpc();

  console.log(`\n✅ Resolution finalised — tx ${sig}`);
  console.log(
    "   Market is now paused. Winning positions can redeem via DFlow;"
  );
  console.log(
    "   losing-side positions can still be force-closed through the bot."
  );
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});

// Ensure this file is treated as a module — the sibling scripts both declare
// a top-level `async main` so without `export {}` tsc would report duplicate
// implementations at the project level.
export {};
