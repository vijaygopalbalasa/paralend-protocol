import { BN } from "@coral-xyz/anchor";
import {
  createMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import {
  APP_DEMO_CONFIG_PATH,
  defaultDemoConfig,
  DEMO_DEPLOYMENT_PATH,
  DEMO_MARKETS,
  DEMO_MINTS_PATH,
  DemoDeploymentFile,
  DemoMintsFile,
  computeMarketId,
  deriveCollateralVault,
  deriveLinearIrm,
  deriveLoanVault,
  deriveMarket,
  deriveProtocolState,
  deriveStaticOracle,
  irmParams,
  makeProgram,
  makeProvider,
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
  const methods = program.methods as any;

  console.log(`\n🚀 Paralend demo setup`);
  console.log(`   Cluster: ${cluster}`);
  console.log(`   RPC:     ${connection.rpcEndpoint}`);
  console.log(`   Wallet:  ${payer.publicKey.toBase58()}`);
  console.log(`   Program: ${PROGRAM_ID.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`   Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.5e9) {
    throw new Error("Insufficient SOL. Fund the deploy wallet before seeding demo markets.");
  }

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
    console.log("\n📋 Protocol state already exists.");
  }

  // Enable all required LLTVs
  console.log("\n⚙️  Enabling LLTVs...");
  const requiredLltvs = [...new Set(DEMO_MARKETS.map((m) => m.lltvBps))];
  for (const lltv of requiredLltvs) {
    try {
      await methods
        .enableLltv(new BN(lltv.toString()))
        .accountsPartial({
          owner: payer.publicKey,
          protocolState,
        })
        .rpc();
      console.log(`   Enabled LLTV: ${Number(lltv) / 100}%`);
    } catch (e: any) {
      if (e.logs?.some((log: string) => log.includes("LltvAlreadyEnabled"))) {
        console.log(`   LLTV ${Number(lltv) / 100}% already enabled`);
      } else {
        throw e;
      }
    }
  }

  const mints = readJsonFile<DemoMintsFile>(DEMO_MINTS_PATH) ?? {
    usdc: "",
    collateral: {},
  };

  console.log("\n💎 Ensuring demo mints...");
  if (!mints.usdc) {
    const usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
    mints.usdc = usdcMint.toBase58();
    console.log(`   Created USDC mint: ${mints.usdc}`);
  } else {
    console.log(`   Reusing USDC mint: ${mints.usdc}`);
  }

  for (const definition of DEMO_MARKETS) {
    if (mints.collateral[definition.key]) {
      console.log(
        `   Reusing ${definition.collateralSymbol} mint: ${mints.collateral[definition.key]}`
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
      `   Created ${definition.collateralSymbol} mint: ${mint.toBase58()}`
    );
  }

  writeJsonFile(DEMO_MINTS_PATH, mints);

  const deployment: DemoDeploymentFile = {
    cluster,
    generatedAt: new Date().toISOString(),
    programId: PROGRAM_ID.toBase58(),
    markets: {},
  };

  const previousConfig = readJsonFile<ReturnType<typeof defaultDemoConfig>>(
    APP_DEMO_CONFIG_PATH
  );
  const appConfig = defaultDemoConfig();
  appConfig.cluster = cluster;
  appConfig.programId = PROGRAM_ID.toBase58();
  appConfig.generatedAt = deployment.generatedAt;
  appConfig.primaryWallet = previousConfig?.primaryWallet;
  appConfig.liquidationTarget = previousConfig?.liquidationTarget;

  appConfig.tokens[mints.usdc] = {
    symbol: "USDC",
    name: "USD Coin",
    icon: "$",
    decimals: 6,
  };

  const loanOracle = deriveStaticOracle(DEMO_MARKETS[0].loanFeedId);
  if (!(await connection.getAccountInfo(loanOracle))) {
    console.log("\n📈 Creating stable loan oracle...");
    await methods
      .createStaticOracle(
        Array.from(DEMO_MARKETS[0].loanFeedId),
        new BN(priceToWad(1, 6).toString())
      )
      .accountsPartial({
        payer: payer.publicKey,
        oracle: loanOracle,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  console.log("\n🏗️  Ensuring IRMs, oracles, and markets...");
  for (const definition of DEMO_MARKETS) {
    const collateralMint = mints.collateral[definition.key];
    if (!collateralMint) {
      throw new Error(`Missing collateral mint for ${definition.key}`);
    }

    const collateralMintPk = new PublicKey(collateralMint);
    const loanMintPk = new PublicKey(mints.usdc);
    const irm = deriveLinearIrm(payer.publicKey, definition.irmNonce);
    const collateralOracle = deriveStaticOracle(definition.collateralFeedId);

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
      console.log(`   Created IRM for ${definition.name}: ${irm.toBase58()}`);
    }

    // Enable the IRM in protocol state (always try, handles idempotent)
    try {
      await methods
        .enableIrm(irm)
        .accountsPartial({
          owner: payer.publicKey,
          protocolState,
        })
        .rpc();
      console.log(`   Enabled IRM: ${irm.toBase58()}`);
    } catch (e: any) {
      if (e.logs?.some((log: string) => log.includes("IrmAlreadyEnabled"))) {
        console.log(`   IRM ${irm.toBase58()} already enabled`);
      } else {
        throw e;
      }
    }

    if (!(await connection.getAccountInfo(collateralOracle))) {
      await methods
        .createStaticOracle(
          Array.from(definition.collateralFeedId),
          new BN(
            priceToWad(
              definition.collateralPriceUsd,
              definition.collateralDecimals
            ).toString()
          )
        )
        .accountsPartial({
          payer: payer.publicKey,
          oracle: collateralOracle,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(
        `   Created oracle for ${definition.name}: ${collateralOracle.toBase58()}`
      );
    }

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
          new BN(definition.feeBps.toString())
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
      console.log(`   Created market ${definition.name}: ${market.toBase58()}`);
    } else {
      console.log(`   Reusing market ${definition.name}: ${market.toBase58()}`);
    }

    deployment.markets[market.toBase58()] = {
      key: definition.key,
      name: definition.name,
      market: market.toBase58(),
      marketId: marketId.toString("hex"),
      collateralMint,
      loanMint: mints.usdc,
      irm: irm.toBase58(),
      collateralOracle: collateralOracle.toBase58(),
      loanOracle: loanOracle.toBase58(),
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
      collateralPriceUsd: definition.collateralPriceUsd,
      loanPriceUsd: definition.loanPriceUsd,
      lltv: Number(definition.lltvBps) / 100,
      feeBps: Number(definition.feeBps),
    };

    appConfig.tokens[collateralMint] = {
      symbol: definition.collateralSymbol,
      name: definition.collateralName,
      icon: definition.collateralIcon,
      decimals: definition.collateralDecimals,
      oracleFeedId: definition.collateralFeedId.toString("hex"),
    };

    appConfig.markets[market.toBase58()] = {
      name: definition.name,
      marketId: marketId.toString("hex"),
      collateralMint,
      loanMint: mints.usdc,
      collateralSymbol: definition.collateralSymbol,
      loanSymbol: definition.loanSymbol,
      oracle: "StaticOracle",
      lltv: Number(definition.lltvBps) / 100,
      feeBps: Number(definition.feeBps),
      irm: irm.toBase58(),
      collateralOracleFeedId: definition.collateralFeedId.toString("hex"),
      loanOracleFeedId: definition.loanFeedId.toString("hex"),
      collateralOracle: collateralOracle.toBase58(),
      loanOracle: loanOracle.toBase58(),
    };
  }

  writeJsonFile(DEMO_DEPLOYMENT_PATH, deployment);
  writeJsonFile(APP_DEMO_CONFIG_PATH, appConfig);

  console.log("\n✅ Demo market setup complete");
  console.log(`   Mints:      ${DEMO_MINTS_PATH}`);
  console.log(`   Deployment: ${DEMO_DEPLOYMENT_PATH}`);
  console.log(`   Frontend:   ${APP_DEMO_CONFIG_PATH}`);
}

main().catch((error) => {
  console.error("❌ Fatal:", error);
  process.exit(1);
});
