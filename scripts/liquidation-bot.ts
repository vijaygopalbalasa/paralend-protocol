import { BN } from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  BPS,
  DEMO_DEPLOYMENT_PATH,
  DEMO_MINTS_PATH,
  DemoDeploymentFile,
  DemoMintsFile,
  WAD,
  deriveCollateralVault,
  deriveLoanVault,
  makeProgram,
  makeProvider,
  parseClusterArg,
  readJsonFile,
} from "./demo-common";

const args = process.argv.slice(2);
const intervalArg = args.find((arg) => arg.startsWith("--interval="));
const once = args.includes("--once");
const pollIntervalMs = Number.parseInt(intervalArg?.split("=")[1] ?? "10000", 10);

function toAssetsUp(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const numerator = shares * (totalAssets + 1n);
  const denominator = totalShares + 1_000_000n;
  return (numerator + denominator - 1n) / denominator;
}

function healthFactor(params: {
  collateral: bigint;
  borrowShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lltv: bigint;
  collateralPriceWad: bigint;
  loanPriceWad: bigint;
}) {
  const {
    borrowShares,
    collateral,
    collateralPriceWad,
    loanPriceWad,
    lltv,
    totalBorrowAssets,
    totalBorrowShares,
  } = params;

  if (borrowShares === 0n) return Number.POSITIVE_INFINITY;
  const borrowAssets = toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares);
  if (borrowAssets === 0n) return Number.POSITIVE_INFINITY;

  const collateralUsd = (collateral * collateralPriceWad) / WAD;
  const debtUsd = (borrowAssets * loanPriceWad + WAD - 1n) / WAD;
  if (debtUsd === 0n) return Number.POSITIVE_INFINITY;
  return Number(collateralUsd * lltv) / Number(debtUsd * BPS);
}

async function ensureLiquidatorUsdc(
  provider: ReturnType<typeof makeProvider>["provider"],
  payer: ReturnType<typeof makeProvider>["payer"],
  usdcMint: PublicKey
) {
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    usdcMint,
    payer.publicKey
  );

  const minimum = 50_000_000_000n;
  const currentAmount = BigInt(ata.amount.toString());
  if (currentAmount < minimum) {
    await mintTo(
      provider.connection,
      payer,
      usdcMint,
      ata.address,
      payer,
      minimum - currentAmount
    );
  }

  return ata.address;
}

async function scanOnce(params: {
  deployment: DemoDeploymentFile;
  program: ReturnType<typeof makeProgram>;
  payer: ReturnType<typeof makeProvider>["payer"];
  liquidatorUsdcAta: PublicKey;
}) {
  const { deployment, liquidatorUsdcAta, payer, program } = params;
  const methods = program.methods as any;
  const positions = await program.account.position.all();
  const indebted = positions.filter(
    (entry) => BigInt(entry.account.borrowShares.toString()) > 0n
  );

  if (indebted.length === 0) {
    console.log(`[${new Date().toISOString()}] no indebted positions`);
    return;
  }

  for (const entry of indebted) {
    const marketId = Buffer.from(entry.account.marketId as number[]);
    const market = Object.values(deployment.markets).find(
      (item) => item.marketId === marketId.toString("hex")
    );
    if (!market) continue;

    const marketAccount = await program.account.market.fetch(
      new PublicKey(market.market)
    );
    const collateralOracle = await program.account.staticOracle.fetch(
      new PublicKey(market.collateralOracle)
    );
    const loanOracle = await program.account.staticOracle.fetch(
      new PublicKey(market.loanOracle)
    );

    const hf = healthFactor({
      collateral: BigInt(entry.account.collateral.toString()),
      borrowShares: BigInt(entry.account.borrowShares.toString()),
      totalBorrowAssets: BigInt(marketAccount.totalBorrowAssets.toString()),
      totalBorrowShares: BigInt(marketAccount.totalBorrowShares.toString()),
      lltv: BigInt(marketAccount.lltv.toString()),
      collateralPriceWad: BigInt(collateralOracle.priceWad.toString()),
      loanPriceWad: BigInt(loanOracle.priceWad.toString()),
    });

    console.log(
      `[${new Date().toISOString()}] ${market.name} ${entry.publicKey
        .toBase58()
        .slice(0, 8)} HF=${hf.toFixed(4)}`
    );

    if (hf >= 1) continue;

    const liquidatorCollateralAta = (
      await getOrCreateAssociatedTokenAccount(
        program.provider.connection,
        payer,
        new PublicKey(market.collateralMint),
        payer.publicKey
      )
    ).address;
    const collateralAmount = BigInt(entry.account.collateral.toString());
    const seizedCollateral = collateralAmount / 2n;
    if (seizedCollateral === 0n) continue;

    try {
      const signature = await methods
        .liquidate(Array.from(marketId), new BN(seizedCollateral.toString()))
        .accountsPartial({
          liquidator: payer.publicKey,
          market: new PublicKey(market.market),
          irm: new PublicKey(market.irm),
          borrowerPosition: entry.publicKey,
          borrower: entry.account.owner,
          liquidatorLoanAta: liquidatorUsdcAta,
          loanVault: deriveLoanVault(marketId),
          collateralVault: deriveCollateralVault(marketId),
          liquidatorCollateralAta,
          collateralOracle: new PublicKey(market.collateralOracle),
          loanOracle: new PublicKey(market.loanOracle),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log(`   ✅ liquidated: ${signature}`);
    } catch (error) {
      console.error(`   ❌ liquidation failed: ${String(error)}`);
    }
  }
}

async function main() {
  const cluster = parseClusterArg();
  const { payer, provider } = makeProvider(cluster);
  const program = makeProgram(provider);

  const deployment = readJsonFile<DemoDeploymentFile>(DEMO_DEPLOYMENT_PATH);
  const mints = readJsonFile<DemoMintsFile>(DEMO_MINTS_PATH);
  if (!deployment || !mints) {
    throw new Error("Run setup-demo-markets.ts and fund-demo.ts before the liquidation bot.");
  }

  console.log(`\n🤖 Paralend liquidation bot`);
  console.log(`   Cluster: ${cluster}`);
  console.log(`   Wallet:  ${payer.publicKey.toBase58()}`);
  console.log(`   Interval: ${pollIntervalMs / 1000}s`);
  console.log(`   Once: ${once ? "yes" : "no"}`);

  const liquidatorUsdcAta = await ensureLiquidatorUsdc(
    provider,
    payer,
    new PublicKey(mints.usdc)
  );

  const loop = async () => {
    await scanOnce({
      deployment,
      program,
      payer,
      liquidatorUsdcAta,
    });
  };

  await loop();
  if (once) return;

  process.on("SIGINT", () => {
    console.log("\n👋 stopping liquidation bot");
    process.exit(0);
  });

  setInterval(() => {
    loop().catch((error) => {
      console.error("❌ loop failed:", error);
    });
  }, pollIntervalMs);
}

main().catch((error) => {
  console.error("❌ Fatal:", error);
  process.exit(1);
});
