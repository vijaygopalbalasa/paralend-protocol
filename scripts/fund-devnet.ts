// scripts/fund-devnet.ts — Paralend devnet liquidity seeder.
//
// Assumptions: `setup-devnet-markets.ts` has already run, so
// devnet-deployment.json, devnet-mints.json, and devnet-attester.json exist.
//
// What it does:
//   1. Funds the primary wallet with USDC (for devnet supply)
//   2. Mints each market's YES-token supply to a per-market borrower wallet
//   3. Creates positions for primary (supplier) and borrower (collateral+borrow)
//   4. On every market: supplies 25k USDC and has the borrower deposit
//      YES tokens then draw a USDC loan
//   5. Persists borrower wallets under scripts/devnet-wallets.json so reruns
//      reuse the same pubkeys (devnet continuity)

import { BN } from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import {
  APP_MARKET_REGISTRY_PATH,
  DEVNET_ATTESTER_PATH,
  DEVNET_DEPLOYMENT_PATH,
  DEVNET_MINTS_PATH,
  DEVNET_WALLETS_PATH,
  DevnetAttesterFile,
  DevnetDeploymentEntry,
  DevnetDeploymentFile,
  DevnetMintsFile,
  DevnetWalletsFile,
  boundedOraclePrice,
  deriveCollateralVault,
  deriveMarket,
  deriveLoanVault,
  derivePosition,
  derivePriceCache,
  deriveProtocolState,
  makeProgram,
  makeProvider,
  parseClusterArg,
  readJsonFile,
  writeJsonFile,
} from "./devnet-common";
import { fetchDflowSpot } from "./dflow";

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
    const signature = await provider.connection.requestAirdrop(
      recipient,
      shortfall
    );
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
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner
  );
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
  market: DevnetDeploymentEntry;
  amount: bigint;
  protocolState: PublicKey;
}) {
  const { actor, amount, market, payer, program, protocolState } = params;
  const methods = program.methods as any;
  const marketId = Buffer.from(market.marketId, "hex");
  const position = await ensurePosition(
    program,
    payer,
    new PublicKey(market.market),
    marketId,
    actor.publicKey
  );
  const positionData = await (program.account as any).position.fetch(position);
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
      protocolState,
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

/**
 * Fresh attestation right before a borrow — devnet confirmations can take
 * longer than the 30 s MAX_ORACLE_AGE, so fetch a live DFlow bid and push it
 * immediately before the borrow.
 */
async function refreshAttestation(
  program: ReturnType<typeof makeProgram>,
  attester: Keypair,
  market: DevnetDeploymentEntry
): Promise<void> {
  const methods = program.methods as any;
  const marketId = Buffer.from(market.marketId, "hex");
  const marketPda = deriveMarket(marketId);
  const priceCache = derivePriceCache(marketId);
  const spot = await fetchDflowSpot(market);
  const cache = await (program.account as any).priceCache.fetch(priceCache);
  const submittedPriceWad = boundedOraclePrice({
    livePriceWad: spot.priceWad,
    lastSpotWad: BigInt(cache.lastSpotWad.toString()),
    emaPriceWad: BigInt(cache.emaPriceWad.toString()),
  });
  await methods
    .attestPrice(Array.from(marketId), new BN(submittedPriceWad.toString()))
    .accountsPartial({
      attester: attester.publicKey,
      market: marketPda,
      priceCache,
    })
    .signers([attester])
    .rpc();
}

async function seedCollateralAndBorrow(params: {
  program: ReturnType<typeof makeProgram>;
  payer: Keypair;
  actor: Keypair;
  attester: Keypair;
  market: DevnetDeploymentEntry;
  collateralAmount: bigint;
  borrowAmount: bigint;
  protocolState: PublicKey;
}) {
  const {
    actor,
    attester,
    borrowAmount,
    collateralAmount,
    market,
    payer,
    program,
    protocolState,
  } = params;
  const methods = program.methods as any;
  const marketId = Buffer.from(market.marketId, "hex");
  const marketPk = new PublicKey(market.market);
  const priceCache = derivePriceCache(marketId);
  const position = await ensurePosition(
    program,
    payer,
    marketPk,
    marketId,
    actor.publicKey
  );
  const positionData = await (program.account as any).position.fetch(position);

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
      .supplyCollateral(
        Array.from(marketId),
        new BN(collateralAmount.toString())
      )
      .accountsPartial({
        depositor: actor.publicKey,
        protocolState,
        market: marketPk,
        position,
        depositorCollateralAta: collateralAta,
        collateralVault: deriveCollateralVault(marketId),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(actor.publicKey.equals(payer.publicKey) ? [] : [actor])
      .rpc();
  }
  const refreshedPosition = await (program.account as any).position.fetch(
    position
  );
  if (BigInt(refreshedPosition.borrowShares.toString()) === 0n) {
    // Reset the staleness timer right before we borrow — devnet confirms
    // are slow enough that a bare borrow often trips OraclePriceStale.
    await refreshAttestation(program, attester, market);

    await methods
      .borrow(Array.from(marketId), new BN(borrowAmount.toString()), new BN(0))
      .accountsPartial({
        borrower: actor.publicKey,
        protocolState,
        market: marketPk,
        irm: new PublicKey(market.irm),
        position,
        loanVault: deriveLoanVault(marketId),
        receiverLoanAta: loanAta,
        priceCache,
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
  const protocolState = deriveProtocolState();

  const deployment = readJsonFile<DevnetDeploymentFile>(DEVNET_DEPLOYMENT_PATH);
  const mints = readJsonFile<DevnetMintsFile>(DEVNET_MINTS_PATH);
  const attesterFile = readJsonFile<DevnetAttesterFile>(DEVNET_ATTESTER_PATH);
  if (!deployment || !mints || !attesterFile) {
    throw new Error("Run setup-devnet-markets.ts before fund-devnet.ts.");
  }
  const attester = Keypair.fromSecretKey(
    Uint8Array.from(attesterFile.secretKey)
  );

  const existingWallets = readJsonFile<DevnetWalletsFile>(
    DEVNET_WALLETS_PATH
  ) ?? {
    primaryWallet: payer.publicKey.toBase58(),
    supportingWallets: {},
  };

  const primaryWallet = payer;

  existingWallets.primaryWallet = primaryWallet.publicKey.toBase58();
  existingWallets.supportingWallets ??= {};

  console.log(`\n💰 Seeding Paralend devnet liquidity`);
  console.log(`   Cluster:        ${cluster}`);
  console.log(`   Primary wallet: ${primaryWallet.publicKey.toBase58()}`);

  for (const market of Object.values(deployment.markets)) {
    const supportingWalletKey = `borrower:${market.key}`;
    const borrower = loadOrCreateWallet(
      existingWallets.supportingWallets[supportingWalletKey]
    );
    existingWallets.supportingWallets[supportingWalletKey] = Array.from(
      borrower.secretKey
    );

    await ensureLamports(cluster, payer, provider, borrower.publicKey);

    const loanDecimals = market.loanDecimals;
    const supplyAmount = toBaseUnits(25_000, loanDecimals);

    console.log(`\n   • ${market.kalshiTicker}`);
    await seedSupply({
      program,
      payer,
      actor: primaryWallet,
      market,
      amount: supplyAmount,
      protocolState,
    });
    console.log(`     Primary wallet supplied 25,000 ${market.loanSymbol}`);

    // Give the borrower some YES tokens and have them borrow against the
    // position. Borrow is sized at ~50 % of the CURRENT effective LLTV
    // (not the raw base LLTV) so near-resolution markets don't immediately
    // fail health checks under the decayed cap.
    const collateralTokens = 500; // 500 YES tokens
    const liveSpot = await fetchDflowSpot(market);
    const expectedCollateralValue = collateralTokens * liveSpot.priceUsd; // USD

    const DECAY_START_SECONDS = 7 * 24 * 3600;
    const remaining =
      market.resolutionTimestamp - Math.floor(Date.now() / 1000);
    const baseLltvFraction = market.lltv / 100;
    const effectiveLltvFraction =
      remaining >= DECAY_START_SECONDS
        ? baseLltvFraction
        : remaining <= 0
        ? 0
        : baseLltvFraction * (remaining / DECAY_START_SECONDS);
    const targetLtv = effectiveLltvFraction * 0.5; // 50 % of effective
    const borrowUsd = Math.max(
      1,
      Math.floor(expectedCollateralValue * targetLtv)
    );

    await seedCollateralAndBorrow({
      program,
      payer,
      actor: borrower,
      attester,
      market,
      collateralAmount: toBaseUnits(
        collateralTokens,
        market.collateralDecimals
      ),
      borrowAmount: toBaseUnits(borrowUsd, market.loanDecimals),
      protocolState,
    });
    console.log(
      `     Borrower wallet posted ${collateralTokens} ${market.collateralSymbol} and borrowed ${borrowUsd} ${market.loanSymbol}`
    );
  }

  // Leave extra USDC in the primary wallet for interactive devnet usage.
  await ensureBalanceAtLeast({
    connection,
    payer,
    mint: new PublicKey(mints.usdc),
    owner: payer.publicKey,
    minimumAmount: toBaseUnits(100_000, 6),
  });

  writeJsonFile(DEVNET_WALLETS_PATH, existingWallets);

  const appConfig =
    readJsonFile<Record<string, unknown>>(APP_MARKET_REGISTRY_PATH) ?? {};
  writeJsonFile(APP_MARKET_REGISTRY_PATH, {
    ...appConfig,
    primaryWallet: primaryWallet.publicKey.toBase58(),
  });

  console.log(`\n✅ Devnet funding complete`);
  console.log(`   Wallets: ${DEVNET_WALLETS_PATH}`);
  console.log(
    "\nNext: run `npx ts-node --project tsconfig.json scripts/attester.ts` to start the price attester daemon."
  );
}

main().catch((error) => {
  console.error("❌ Fatal:", error);
  process.exit(1);
});
