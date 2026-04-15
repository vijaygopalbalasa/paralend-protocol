import { BN } from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import {
  APP_DEMO_CONFIG_PATH,
  DEMO_DEPLOYMENT_PATH,
  DEMO_MARKETS,
  DEMO_MINTS_PATH,
  DEMO_WALLETS_PATH,
  DemoDeploymentEntry,
  DemoDeploymentFile,
  DemoMintsFile,
  DemoWalletsFile,
  deriveCollateralVault,
  deriveLoanVault,
  derivePosition,
  makeProgram,
  makeProvider,
  parseClusterArg,
  readJsonFile,
  writeJsonFile,
} from "./demo-common";

function toBaseUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

function loadOrCreateWallet(secretKey?: number[]): Keypair {
  return secretKey
    ? Keypair.fromSecretKey(Uint8Array.from(secretKey))
    : Keypair.generate();
}

async function ensureLamports(
  cluster: "devnet" | "localnet",
  payer: Keypair,
  provider: ReturnType<typeof makeProvider>["provider"],
  recipient: PublicKey,
  minimumLamports = 200_000_000
) {
  const current = await provider.connection.getBalance(recipient);
  if (current >= minimumLamports) return;

  const shortfall = minimumLamports - current;
  if (cluster === "localnet") {
    const signature = await provider.connection.requestAirdrop(recipient, shortfall);
    await provider.connection.confirmTransaction(signature, "confirmed");
    return;
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: shortfall,
    })
  );
  await provider.sendAndConfirm(tx, []);
}

async function ensurePosition(
  program: ReturnType<typeof makeProgram>,
  payer: Keypair,
  market: PublicKey,
  marketId: Buffer,
  owner: PublicKey
) {
  const methods = program.methods as any;
  const position = derivePosition(marketId, owner);
  const existing = await program.provider.connection.getAccountInfo(position);
  if (!existing) {
    await methods
      .createPosition(Array.from(marketId))
      .accountsPartial({
        payer: payer.publicKey,
        owner,
        market,
        position,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }
  return position;
}

async function ensureBalanceAtLeast(params: {
  connection: ReturnType<typeof makeProvider>["connection"];
  payer: Keypair;
  mint: PublicKey;
  owner: PublicKey;
  minimumAmount: bigint;
}) {
  const { connection, mint, minimumAmount, owner, payer } = params;
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner);
  const currentAmount = BigInt(ata.amount.toString());
  if (currentAmount < minimumAmount) {
    await mintTo(
      connection,
      payer,
      mint,
      ata.address,
      payer,
      minimumAmount - currentAmount
    );
  }
  return ata.address;
}

async function seedSupply(params: {
  program: ReturnType<typeof makeProgram>;
  payer: Keypair;
  actor: Keypair;
  market: DemoDeploymentEntry;
  amount: bigint;
}) {
  const { actor, amount, market, payer, program } = params;
  const methods = program.methods as any;
  const marketId = Buffer.from(market.marketId, "hex");
  const position = await ensurePosition(
    program,
    payer,
    new PublicKey(market.market),
    marketId,
    actor.publicKey
  );
  const positionData = await program.account.position.fetch(position);
  if (BigInt(positionData.supplyShares.toString()) > 0n) return;

  const loanAta = await ensureBalanceAtLeast({
    connection: program.provider.connection,
    payer,
    mint: new PublicKey(market.loanMint),
    owner: actor.publicKey,
    minimumAmount: amount,
  });

  await methods
    .supply(Array.from(marketId), new BN(amount.toString()), new BN(0))
    .accountsPartial({
      supplier: actor.publicKey,
      market: new PublicKey(market.market),
      irm: new PublicKey(market.irm),
      position,
      supplierLoanAta: loanAta,
      loanVault: deriveLoanVault(marketId),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers(actor.publicKey.equals(payer.publicKey) ? [] : [actor])
    .rpc();
}

async function seedCollateralAndBorrow(params: {
  program: ReturnType<typeof makeProgram>;
  payer: Keypair;
  actor: Keypair;
  market: DemoDeploymentEntry;
  collateralAmount: bigint;
  borrowAmount: bigint;
}) {
  const { actor, borrowAmount, collateralAmount, market, payer, program } = params;
  const methods = program.methods as any;
  const marketId = Buffer.from(market.marketId, "hex");
  const marketPk = new PublicKey(market.market);
  const position = await ensurePosition(
    program,
    payer,
    marketPk,
    marketId,
    actor.publicKey
  );
  const positionData = await program.account.position.fetch(position);

  const collateralAta = await ensureBalanceAtLeast({
    connection: program.provider.connection,
    payer,
    mint: new PublicKey(market.collateralMint),
    owner: actor.publicKey,
    minimumAmount: collateralAmount,
  });
  const loanAta = (
    await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      new PublicKey(market.loanMint),
      actor.publicKey
    )
  ).address;

  if (BigInt(positionData.collateral.toString()) === 0n) {
    await methods
      .supplyCollateral(Array.from(marketId), new BN(collateralAmount.toString()))
      .accountsPartial({
        depositor: actor.publicKey,
        market: marketPk,
        position,
        depositorCollateralAta: collateralAta,
        collateralVault: deriveCollateralVault(marketId),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(actor.publicKey.equals(payer.publicKey) ? [] : [actor])
      .rpc();
  }

  const refreshedPosition = await program.account.position.fetch(position);
  if (BigInt(refreshedPosition.borrowShares.toString()) === 0n) {
    await methods
      .borrow(Array.from(marketId), new BN(borrowAmount.toString()), new BN(0))
      .accountsPartial({
        borrower: actor.publicKey,
        market: marketPk,
        irm: new PublicKey(market.irm),
        position,
        loanVault: deriveLoanVault(marketId),
        receiverLoanAta: loanAta,
        collateralOracle: new PublicKey(market.collateralOracle),
        loanOracle: new PublicKey(market.loanOracle),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(actor.publicKey.equals(payer.publicKey) ? [] : [actor])
      .rpc();
  }
}

async function main() {
  const cluster = parseClusterArg();
  const { connection, payer, provider } = makeProvider(cluster);
  const program = makeProgram(provider);

  const deployment = readJsonFile<DemoDeploymentFile>(DEMO_DEPLOYMENT_PATH);
  const mints = readJsonFile<DemoMintsFile>(DEMO_MINTS_PATH);
  if (!deployment || !mints) {
    throw new Error("Run setup-demo-markets.ts before fund-demo.ts.");
  }

  const existingWallets = readJsonFile<DemoWalletsFile>(DEMO_WALLETS_PATH) ?? {
    primaryWallet: payer.publicKey.toBase58(),
    liquidationTarget: "",
    supportingWallets: {},
  };

  const primaryWallet = payer;
  const liquidationTarget = loadOrCreateWallet(
    existingWallets.liquidationTargetSecretKey
  );

  existingWallets.primaryWallet = primaryWallet.publicKey.toBase58();
  existingWallets.liquidationTarget = liquidationTarget.publicKey.toBase58();
  existingWallets.liquidationTargetSecretKey = Array.from(
    liquidationTarget.secretKey
  );
  existingWallets.supportingWallets ??= {};

  console.log(`\n💰 Funding demo accounts`);
  console.log(`   Cluster: ${cluster}`);
  console.log(`   Primary wallet: ${primaryWallet.publicKey.toBase58()}`);
  console.log(`   Liquidation target: ${liquidationTarget.publicKey.toBase58()}`);

  await ensureLamports(cluster, payer, provider, liquidationTarget.publicKey);

  for (const definition of DEMO_MARKETS) {
    const market = Object.values(deployment.markets).find(
      (entry) => entry.key === definition.key
    );
    if (!market) {
      throw new Error(`Missing deployment entry for ${definition.key}`);
    }

    const supportingWalletKey = `borrower:${definition.key}`;
    const borrower = loadOrCreateWallet(
      existingWallets.supportingWallets[supportingWalletKey]
    );
    existingWallets.supportingWallets[supportingWalletKey] = Array.from(
      borrower.secretKey
    );

    await ensureLamports(cluster, payer, provider, borrower.publicKey);

    const loanDecimals = market.loanDecimals;
    const supplyAmount = toBaseUnits(25_000, loanDecimals);

    console.log(`\n   • ${market.name}`);
    await seedSupply({
      program,
      payer,
      actor: primaryWallet,
      market,
      amount: supplyAmount,
    });
    console.log(`     Primary wallet supplied 25,000 ${market.loanSymbol}`);

    if (definition.key === "wsol-usdc") {
      await seedCollateralAndBorrow({
        program,
        payer,
        actor: primaryWallet,
        market,
        collateralAmount: toBaseUnits(40, market.collateralDecimals),
        borrowAmount: toBaseUnits(3_000, market.loanDecimals),
      });
      console.log(
        `     Primary wallet posted 40 ${market.collateralSymbol} and borrowed 3,000 ${market.loanSymbol}`
      );
    } else {
      await seedCollateralAndBorrow({
        program,
        payer,
        actor: borrower,
        market,
        collateralAmount:
          definition.key === "jup-usdc"
            ? toBaseUnits(50_000, market.collateralDecimals)
            : toBaseUnits(120, market.collateralDecimals),
        borrowAmount: toBaseUnits(8_000, market.loanDecimals),
      });
      console.log(`     Borrower wallet seeded on ${market.name}`);
    }
  }

  const jupMarket = Object.values(deployment.markets).find(
    (entry) => entry.key === "jup-usdc"
  );
  if (!jupMarket) {
    throw new Error("Missing JUP / USDC market deployment.");
  }

  await seedCollateralAndBorrow({
    program,
    payer,
    actor: liquidationTarget,
    market: jupMarket,
    collateralAmount: toBaseUnits(20_000, jupMarket.collateralDecimals),
    borrowAmount: toBaseUnits(10_500, jupMarket.loanDecimals),
  });

  await ensureBalanceAtLeast({
    connection,
    payer,
    mint: new PublicKey(mints.usdc),
    owner: payer.publicKey,
    minimumAmount: toBaseUnits(100_000, 6),
  });

  writeJsonFile(DEMO_WALLETS_PATH, existingWallets);

  const appConfig = readJsonFile<Record<string, unknown>>(APP_DEMO_CONFIG_PATH) ?? {};
  writeJsonFile(APP_DEMO_CONFIG_PATH, {
    ...appConfig,
    primaryWallet: primaryWallet.publicKey.toBase58(),
    liquidationTarget: liquidationTarget.publicKey.toBase58(),
  });

  console.log(`\n✅ Demo funding complete`);
  console.log(`   Wallets: ${DEMO_WALLETS_PATH}`);
  console.log(`   Frontend manifest updated with primary wallet and liquidation target.`);
}

main().catch((error) => {
  console.error("❌ Fatal:", error);
  process.exit(1);
});
