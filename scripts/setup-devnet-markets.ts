// scripts/setup-devnet-markets.ts — one-shot idempotent Paralend devnet setup.
//
// Creates (if missing):
//   1. ProtocolState singleton
//   2. LLTV whitelist entries
//   3. USDC loan mint + devnet outcome mints (one per DFlow outcome)
//   4. LinearIrm PDAs (one per discovered DFlow market)
//   5. Market PDAs with resolution_timestamp + kalshi_ticker
//   6. PriceCache PDAs seeded with initialPriceUsd
//   7. Attester keypair (persisted to scripts/devnet-attester.json)
//
// Writes:
//   - scripts/devnet-mints.json         — mint addresses (reused across reruns)
//   - scripts/devnet-deployment.json    — per-market addresses + metadata
//   - scripts/devnet-attester.json      — attester keypair (DO NOT commit)
//   - app/src/lib/market-registry.json    — frontend-facing metadata

import { BN } from "@coral-xyz/anchor";
import { createMint, getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

import {
  APP_MARKET_REGISTRY_PATH,
  defaultMarketRegistry,
  DEVNET_ATTESTER_PATH,
  DEVNET_DEPLOYMENT_PATH,
  DEVNET_MINTS_PATH,
  DevnetAttesterFile,
  DevnetDeploymentFile,
  DevnetMintsFile,
  DevnetMarketDefinition,
  REFERENCE_NOW_SECONDS,
  computeMarketId,
  deriveCollateralVault,
  deriveLinearIrm,
  deriveLoanVault,
  deriveMarket,
  derivePriceCache,
  deriveProtocolState,
  irmParams,
  makeProgram,
  makeProvider,
  packTicker,
  parseClusterArg,
  priceToWad,
  PROGRAM_ID,
  readJsonFile,
  resolveFeedId,
  writeJsonFile,
} from "./devnet-common";
import { loadDflowMarketDefinitions } from "./dflow";

const FORCE_CLOSE_WINDOW_SECONDS = 7_200;

function minimumFreshRemaining(definition: DevnetMarketDefinition): number {
  return Math.max(
    FORCE_CLOSE_WINDOW_SECONDS + 3600,
    Math.floor(definition.resolutionInSeconds * 0.6)
  );
}

async function cachedMintExists(
  connection: ReturnType<typeof makeProvider>["connection"],
  mintAddress?: string
): Promise<boolean> {
  if (!mintAddress) return false;
  try {
    await getMint(connection, new PublicKey(mintAddress));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const cluster = parseClusterArg();
  const { connection, payer, provider } = makeProvider(cluster);
  const program = makeProgram(provider);
  const methods = program.methods as any;

  console.log(`\n🚀 Paralend devnet setup`);
  console.log(`   Cluster: ${cluster}`);
  console.log(`   RPC:     ${connection.rpcEndpoint}`);
  console.log(`   Wallet:  ${payer.publicKey.toBase58()}`);
  console.log(`   Program: ${PROGRAM_ID.toBase58()}`);

  const marketDefinitions = await loadDflowMarketDefinitions({ cluster });
  console.log("   Markets:");
  for (const definition of marketDefinitions) {
    console.log(
      `     ${definition.kalshiTicker} ${definition.collateralSymbol} @ $${definition.initialPriceUsd.toFixed(4)}`
    );
  }

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`   Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.5e9) {
    throw new Error(
      "Insufficient SOL. Fund the deploy wallet before seeding devnet markets."
    );
  }

  // ── 1. Protocol state ────────────────────────────────────────────────────
  const protocolState = deriveProtocolState();
  const protocolInfo = await connection.getAccountInfo(protocolState);
  if (!protocolInfo) {
    console.log("\n📋 Initializing protocol state...");
    await methods
      .initializeProtocol(payer.publicKey, payer.publicKey)
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } else {
    console.log("\n📋 Protocol state already initialized.");
  }

  // ── 2. LLTV whitelist ────────────────────────────────────────────────────
  console.log("\n⚙️  Whitelisting LLTVs...");
  const requiredLltvs = [...new Set(marketDefinitions.map((m) => m.lltvBps))];
  for (const lltv of requiredLltvs) {
    try {
      await methods
        .enableLltv(new BN(lltv.toString()))
        .accountsPartial({ owner: payer.publicKey, protocolState })
        .rpc();
      console.log(`   Enabled LLTV ${Number(lltv) / 100}%`);
    } catch (e: unknown) {
      if (
        (e as { logs?: string[] }).logs?.some((log: string) =>
          log.includes("LltvAlreadyEnabled")
        )
      ) {
        console.log(`   LLTV ${Number(lltv) / 100}% already enabled`);
      } else {
        throw e;
      }
    }
  }

  // ── 3. Attester keypair (persist for reuse) ──────────────────────────────
  let attester: Keypair;
  const existingAttester = readJsonFile<DevnetAttesterFile>(DEVNET_ATTESTER_PATH);
  if (existingAttester) {
    attester = Keypair.fromSecretKey(Uint8Array.from(existingAttester.secretKey));
    console.log(
      `\n🔐 Reusing attester keypair: ${attester.publicKey.toBase58()}`
    );
  } else {
    attester = Keypair.generate();
    writeJsonFile(DEVNET_ATTESTER_PATH, {
      pubkey: attester.publicKey.toBase58(),
      secretKey: Array.from(attester.secretKey),
    } as DevnetAttesterFile);
    console.log(
      `\n🔐 Created attester keypair: ${attester.publicKey.toBase58()}`
    );
  }

  // ── 4. Mints ─────────────────────────────────────────────────────────────
  const mints = readJsonFile<DevnetMintsFile>(DEVNET_MINTS_PATH) ?? {
    usdc: "",
    collateral: {},
  };

  console.log("\n💎 Ensuring devnet mints...");
  if (!(await cachedMintExists(connection, mints.usdc))) {
    if (mints.usdc) {
      console.log(`   Cached USDC mint missing on ${cluster}; recreating.`);
    }
    const usdcMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      6
    );
    mints.usdc = usdcMint.toBase58();
    console.log(`   Created USDC mint: ${mints.usdc}`);
  } else {
    console.log(`   Reusing USDC mint: ${mints.usdc}`);
  }

  for (const definition of marketDefinitions) {
    if (await cachedMintExists(connection, mints.collateral[definition.key])) {
      console.log(
        `   Reusing ${definition.kalshiTicker} ${definition.collateralSymbol} outcome mint: ${mints.collateral[definition.key]}`
      );
      continue;
    }
    if (mints.collateral[definition.key]) {
      console.log(
        `   Cached ${definition.kalshiTicker} ${definition.collateralSymbol} outcome mint missing on ${cluster}; recreating.`
      );
    }

    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      definition.collateralDecimals
    );
    mints.collateral[definition.key] = mint.toBase58();
    console.log(
      `   Created ${definition.kalshiTicker} ${definition.collateralSymbol} outcome mint: ${mint.toBase58()}`
    );
  }

  writeJsonFile(DEVNET_MINTS_PATH, mints);

  // ── 5. Markets, PriceCaches, IRMs ────────────────────────────────────────
  const deployment: DevnetDeploymentFile = {
    cluster,
    generatedAt: new Date().toISOString(),
    programId: PROGRAM_ID.toBase58(),
    attester: attester.publicKey.toBase58(),
    markets: {},
  };

  const previousDeployment = readJsonFile<DevnetDeploymentFile>(
    DEVNET_DEPLOYMENT_PATH
  );
  const previousConfig = readJsonFile<ReturnType<typeof defaultMarketRegistry>>(
    APP_MARKET_REGISTRY_PATH
  );
  const appConfig = defaultMarketRegistry();
  appConfig.cluster = cluster;
  appConfig.programId = PROGRAM_ID.toBase58();
  appConfig.generatedAt = deployment.generatedAt;
  appConfig.attester = attester.publicKey.toBase58();
  appConfig.primaryWallet = previousConfig?.primaryWallet;
  appConfig.liquidationTarget = previousConfig?.liquidationTarget;

  appConfig.tokens[mints.usdc] = {
    symbol: "USDC",
    name: "USD Coin (devnet)",
    icon: "$",
    decimals: 6,
  };

  console.log("\n🏗️  Ensuring IRMs, markets, and price caches...");
  for (const definition of marketDefinitions) {
    const collateralMint = mints.collateral[definition.key];
    if (!collateralMint) {
      throw new Error(`Missing collateral mint for ${definition.key}`);
    }

    const collateralMintPk = new PublicKey(collateralMint);
    const loanMintPk = new PublicKey(mints.usdc);
    const irm = deriveLinearIrm(payer.publicKey, definition.irmNonce);

    // IRM
    if (!(await connection.getAccountInfo(irm))) {
      const params = irmParams(definition);
      await methods
        .createIrm(
          new BN(params.baseRate.toString()),
          new BN(params.slope1.toString()),
          new BN(params.slope2.toString()),
          new BN(params.kink.toString()),
          new BN(definition.irmNonce.toString())
        )
        .accountsPartial({
          payer: payer.publicKey,
          irm,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`   Created IRM for ${definition.kalshiTicker}: ${irm.toBase58()}`);
    } else {
      console.log(`   Reusing IRM for ${definition.kalshiTicker}`);
    }

    // Whitelist IRM (idempotent — catches IrmAlreadyEnabled)
    try {
      await methods
        .enableIrm(irm)
        .accountsPartial({ owner: payer.publicKey, protocolState })
        .rpc();
      console.log(`   Enabled IRM: ${irm.toBase58()}`);
    } catch (e: unknown) {
      if (
        (e as { logs?: string[] }).logs?.some((log: string) =>
          log.includes("IrmAlreadyEnabled")
        )
      ) {
        // idempotent — fine
      } else {
        throw e;
      }
    }

    // Market. Market IDs intentionally exclude resolution_timestamp, so a
    // rolling devnet market needs a fresh feed id once the prior instance is too
    // close to settlement. Prefer the previous deployment's feed id while it is
    // still fresh; otherwise roll to a new feed id and create a new market.
    const targetResolutionTimestamp =
      REFERENCE_NOW_SECONDS + definition.resolutionInSeconds;
    const previousEntry = previousDeployment
      ? Object.values(previousDeployment.markets).find(
          (entry) => entry.key === definition.key
        )
      : undefined;
    const candidateFeedIds = [
      previousEntry?.collateralOracleFeedId
        ? Buffer.from(previousEntry.collateralOracleFeedId, "hex")
        : undefined,
      definition.collateralFeedId,
    ].filter((feed): feed is Buffer => Boolean(feed));

    let collateralFeedId = definition.collateralFeedId;
    let marketId = computeMarketId(
      collateralMintPk,
      loanMintPk,
      collateralFeedId,
      definition.loanFeedId,
      irm,
      definition.lltvBps
    );
    let market = deriveMarket(marketId);
    let existingMarketAccount:
      | Awaited<ReturnType<typeof program.account.market.fetch>>
      | null = null;
    const minRemaining = minimumFreshRemaining(definition);

    for (const feedId of candidateFeedIds) {
      const candidateMarketId = computeMarketId(
        collateralMintPk,
        loanMintPk,
        feedId,
        definition.loanFeedId,
        irm,
        definition.lltvBps
      );
      const candidateMarket = deriveMarket(candidateMarketId);
      const info = await connection.getAccountInfo(candidateMarket);
      if (!info) {
        collateralFeedId = feedId;
        marketId = candidateMarketId;
        market = candidateMarket;
        existingMarketAccount = null;
        break;
      }
      const account = await (program.account as any).market.fetch(candidateMarket);
      const remaining =
        Number(account.resolutionTimestamp?.toString?.() ?? account.resolutionTimestamp) -
        REFERENCE_NOW_SECONDS;
      if (remaining >= minRemaining) {
        collateralFeedId = feedId;
        marketId = candidateMarketId;
        market = candidateMarket;
        existingMarketAccount = account;
        break;
      }
    }

    if (existingMarketAccount) {
      console.log(
        `   Reusing fresh market ${definition.kalshiTicker}: ${market.toBase58()}`
      );
    } else if (await connection.getAccountInfo(market)) {
      collateralFeedId = resolveFeedId(
        `dflow:${definition.kalshiTicker}:${definition.collateralSymbol}:${definition.sourceCollateralMint ?? "devnet"}:${REFERENCE_NOW_SECONDS}`
      );
      marketId = computeMarketId(
        collateralMintPk,
        loanMintPk,
        collateralFeedId,
        definition.loanFeedId,
        irm,
        definition.lltvBps
      );
      market = deriveMarket(marketId);
    }

    if (!(await connection.getAccountInfo(market))) {
      await methods
        .createMarket(
          Array.from(marketId),
          Array.from(collateralFeedId),
          Array.from(definition.loanFeedId),
          irm,
          new BN(definition.lltvBps.toString()),
          new BN(definition.feeBps.toString()),
          new BN(targetResolutionTimestamp),
          Array.from(packTicker(definition.kalshiTicker))
        )
        .accountsPartial({
          payer: payer.publicKey,
          protocolState,
          collateralMint: collateralMintPk,
          loanMint: loanMintPk,
          irmAccount: irm,
          market,
          collateralVault: deriveCollateralVault(marketId),
          loanVault: deriveLoanVault(marketId),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(
        `   Created market ${definition.kalshiTicker}: ${market.toBase58()}`
      );
    } else {
      console.log(
        `   Reusing market ${definition.kalshiTicker}: ${market.toBase58()}`
      );
    }
    const marketAccount = await (program.account as any).market.fetch(market);
    const resolutionTimestamp = Number(
      marketAccount.resolutionTimestamp?.toString?.() ??
        marketAccount.resolutionTimestamp
    );

    // Price cache (per market, one attester)
    const priceCache = derivePriceCache(marketId);
    if (!(await connection.getAccountInfo(priceCache))) {
      const initialPrice = priceToWad(
        definition.initialPriceUsd,
        definition.collateralDecimals
      );
      await methods
        .registerPriceCache(
          Array.from(marketId),
          attester.publicKey,
          new BN(initialPrice.toString())
        )
        .accountsPartial({
          payer: payer.publicKey,
          protocolState,
          market,
          priceCache,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(
        `   Created PriceCache for ${definition.kalshiTicker} @ $${definition.initialPriceUsd}`
      );
    } else {
      console.log(`   Reusing PriceCache for ${definition.kalshiTicker}`);
    }

    deployment.markets[market.toBase58()] = {
      key: definition.key,
      name: definition.name,
      kalshiTicker: definition.kalshiTicker,
      resolutionTimestamp,
      market: market.toBase58(),
      marketId: marketId.toString("hex"),
      collateralMint,
      sourceCollateralMint: definition.sourceCollateralMint,
      sourceMarketLedger: definition.sourceMarketLedger,
      sourceSettlementMint: definition.sourceSettlementMint,
      loanMint: mints.usdc,
      irm: irm.toBase58(),
      priceCache: priceCache.toBase58(),
      collateralOracleFeedId: collateralFeedId.toString("hex"),
      loanOracleFeedId: definition.loanFeedId.toString("hex"),
      collateralSymbol: definition.collateralSymbol,
      loanSymbol: definition.loanSymbol,
      collateralName: definition.collateralName,
      loanName: definition.loanName,
      collateralIcon: definition.collateralIcon,
      loanIcon: definition.loanIcon,
      collateralDecimals: definition.collateralDecimals,
      loanDecimals: definition.loanDecimals,
      initialPriceUsd: definition.initialPriceUsd,
      lltv: Number(definition.lltvBps) / 100,
      feeBps: Number(definition.feeBps),
      attester: attester.publicKey.toBase58(),
    };

    appConfig.tokens[collateralMint] = {
      symbol: definition.collateralSymbol,
      name: definition.collateralName,
      icon: definition.collateralIcon,
      decimals: definition.collateralDecimals,
      sourceMint: definition.sourceCollateralMint,
    };

    appConfig.markets[market.toBase58()] = {
      name: definition.name,
      kalshiTicker: definition.kalshiTicker,
      resolutionTimestamp,
      marketId: marketId.toString("hex"),
      collateralMint,
      sourceCollateralMint: definition.sourceCollateralMint,
      loanMint: mints.usdc,
      collateralSymbol: definition.collateralSymbol,
      loanSymbol: definition.loanSymbol,
      oracle: "DFlow live bid (attested EMA)",
      lltv: Number(definition.lltvBps) / 100,
      feeBps: Number(definition.feeBps),
      irm: irm.toBase58(),
      priceCache: priceCache.toBase58(),
      collateralOracleFeedId: collateralFeedId.toString("hex"),
      loanOracleFeedId: definition.loanFeedId.toString("hex"),
    };
  }

  writeJsonFile(DEVNET_DEPLOYMENT_PATH, deployment);
  writeJsonFile(APP_MARKET_REGISTRY_PATH, appConfig);

  console.log("\n✅ Devnet market setup complete");
  console.log(`   Mints:      ${DEVNET_MINTS_PATH}`);
  console.log(`   Deployment: ${DEVNET_DEPLOYMENT_PATH}`);
  console.log(`   Attester:   ${DEVNET_ATTESTER_PATH}`);
  console.log(`   Frontend:   ${APP_MARKET_REGISTRY_PATH}`);
  console.log("\nNext: run `npx ts-node --project tsconfig.json scripts/fund-devnet.ts` to seed liquidity.");
  console.log("       then `npx ts-node --project tsconfig.json scripts/attester.ts` to start pushing prices.");
}

main().catch((error) => {
  console.error("❌ Fatal:", error);
  process.exit(1);
});
