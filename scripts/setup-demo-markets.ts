// scripts/setup-demo-markets.ts — one-shot idempotent Paralend demo setup.
//
// Creates (if missing):
//   1. ProtocolState singleton
//   2. LLTV whitelist entries
//   3. USDC loan mint + YES-side collateral mints (one per market)
//   4. LinearIrm PDAs (one per market, nonce from DEMO_MARKETS)
//   5. Market PDAs with resolution_timestamp + kalshi_ticker
//   6. PriceCache PDAs seeded with initialPriceUsd
//   7. Attester keypair (persisted to scripts/demo-attester.json)
//
// Writes:
//   - scripts/demo-mints.json         — mint addresses (reused across reruns)
//   - scripts/demo-deployment.json    — per-market addresses + metadata
//   - scripts/demo-attester.json      — attester keypair (DO NOT commit)
//   - app/src/lib/demo-config.json    — frontend-facing metadata

import { BN } from "@coral-xyz/anchor";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

import {
  APP_DEMO_CONFIG_PATH,
  defaultDemoConfig,
  DEMO_ATTESTER_PATH,
  DEMO_DEPLOYMENT_PATH,
  DEMO_MARKETS,
  DEMO_MINTS_PATH,
  DemoAttesterFile,
  DemoDeploymentFile,
  DemoMintsFile,
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
  writeJsonFile,
} from "./demo-common";

async function main() {
  const cluster = parseClusterArg();
  const { connection, payer, provider } = makeProvider(cluster);
  const program = makeProgram(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods = program.methods as any;

  console.log(`\n🚀 Paralend demo setup`);
  console.log(`   Cluster: ${cluster}`);
  console.log(`   RPC:     ${connection.rpcEndpoint}`);
  console.log(`   Wallet:  ${payer.publicKey.toBase58()}`);
  console.log(`   Program: ${PROGRAM_ID.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`   Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.5e9) {
    throw new Error(
      "Insufficient SOL. Fund the deploy wallet before seeding demo markets."
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
  const requiredLltvs = [...new Set(DEMO_MARKETS.map((m) => m.lltvBps))];
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
  const existingAttester = readJsonFile<DemoAttesterFile>(DEMO_ATTESTER_PATH);
  if (existingAttester) {
    attester = Keypair.fromSecretKey(Uint8Array.from(existingAttester.secretKey));
    console.log(
      `\n🔐 Reusing attester keypair: ${attester.publicKey.toBase58()}`
    );
  } else {
    attester = Keypair.generate();
    writeJsonFile(DEMO_ATTESTER_PATH, {
      pubkey: attester.publicKey.toBase58(),
      secretKey: Array.from(attester.secretKey),
    } as DemoAttesterFile);
    console.log(
      `\n🔐 Created attester keypair: ${attester.publicKey.toBase58()}`
    );
  }

  // ── 4. Mints ─────────────────────────────────────────────────────────────
  const mints = readJsonFile<DemoMintsFile>(DEMO_MINTS_PATH) ?? {
    usdc: "",
    collateral: {},
  };

  console.log("\n💎 Ensuring demo mints...");
  if (!mints.usdc) {
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

  for (const definition of DEMO_MARKETS) {
    if (mints.collateral[definition.key]) {
      console.log(
        `   Reusing ${definition.kalshiTicker} YES mint: ${mints.collateral[definition.key]}`
      );
      continue;
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
      `   Created ${definition.kalshiTicker} YES mint: ${mint.toBase58()}`
    );
  }

  writeJsonFile(DEMO_MINTS_PATH, mints);

  // ── 5. Markets, PriceCaches, IRMs ────────────────────────────────────────
  const deployment: DemoDeploymentFile = {
    cluster,
    generatedAt: new Date().toISOString(),
    programId: PROGRAM_ID.toBase58(),
    attester: attester.publicKey.toBase58(),
    markets: {},
  };

  const previousConfig = readJsonFile<ReturnType<typeof defaultDemoConfig>>(
    APP_DEMO_CONFIG_PATH
  );
  const appConfig = defaultDemoConfig();
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
  for (const definition of DEMO_MARKETS) {
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

    // Market
    const resolutionTimestamp = REFERENCE_NOW_SECONDS + definition.resolutionInSeconds;
    const marketId = computeMarketId(
      collateralMintPk,
      loanMintPk,
      definition.collateralFeedId,
      definition.loanFeedId,
      irm,
      definition.lltvBps
    );
    const market = deriveMarket(marketId);

    if (!(await connection.getAccountInfo(market))) {
      await methods
        .createMarket(
          Array.from(marketId),
          Array.from(definition.collateralFeedId),
          Array.from(definition.loanFeedId),
          irm,
          new BN(definition.lltvBps.toString()),
          new BN(definition.feeBps.toString()),
          new BN(resolutionTimestamp),
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
      loanMint: mints.usdc,
      irm: irm.toBase58(),
      priceCache: priceCache.toBase58(),
      collateralOracleFeedId: definition.collateralFeedId.toString("hex"),
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
    };

    appConfig.markets[market.toBase58()] = {
      name: definition.name,
      kalshiTicker: definition.kalshiTicker,
      resolutionTimestamp,
      marketId: marketId.toString("hex"),
      collateralMint,
      loanMint: mints.usdc,
      collateralSymbol: definition.collateralSymbol,
      loanSymbol: definition.loanSymbol,
      oracle: "PriceCache (attester EMA)",
      lltv: Number(definition.lltvBps) / 100,
      feeBps: Number(definition.feeBps),
      irm: irm.toBase58(),
      priceCache: priceCache.toBase58(),
      collateralOracleFeedId: definition.collateralFeedId.toString("hex"),
      loanOracleFeedId: definition.loanFeedId.toString("hex"),
    };
  }

  writeJsonFile(DEMO_DEPLOYMENT_PATH, deployment);
  writeJsonFile(APP_DEMO_CONFIG_PATH, appConfig);

  console.log("\n✅ Demo market setup complete");
  console.log(`   Mints:      ${DEMO_MINTS_PATH}`);
  console.log(`   Deployment: ${DEMO_DEPLOYMENT_PATH}`);
  console.log(`   Attester:   ${DEMO_ATTESTER_PATH}`);
  console.log(`   Frontend:   ${APP_DEMO_CONFIG_PATH}`);
  console.log("\nNext: run `npx ts-node --project tsconfig.json scripts/fund-demo.ts` to seed liquidity.");
  console.log("       then `npx ts-node --project tsconfig.json scripts/attester.ts` to start pushing prices.");
}

main().catch((error) => {
  console.error("❌ Fatal:", error);
  process.exit(1);
});
