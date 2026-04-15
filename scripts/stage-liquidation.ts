import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  BPS,
  DEMO_DEPLOYMENT_PATH,
  DEMO_WALLETS_PATH,
  DemoDeploymentFile,
  DemoWalletsFile,
  WAD,
  derivePosition,
  makeProgram,
  makeProvider,
  parseClusterArg,
  priceToWad,
  readJsonFile,
} from "./demo-common";

const args = process.argv.slice(2);
const marketKeyArg = args.find((arg) => arg.startsWith("--market-key="));
const priceArg = args.find((arg) => arg.startsWith("--price="));
const restore = args.includes("--restore");

function toAssetsUp(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint {
  const numerator = shares * (totalAssets + 1n);
  const denominator = totalShares + 1_000_000n;
  return (numerator + denominator - 1n) / denominator;
}

function computeHealthFactor(params: {
  collateral: bigint;
  borrowShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lltv: bigint;
  collateralPriceWad: bigint;
  loanPriceWad: bigint;
}) {
  const borrowAssets = toAssetsUp(
    params.borrowShares,
    params.totalBorrowAssets,
    params.totalBorrowShares
  );
  if (borrowAssets === 0n) return Number.POSITIVE_INFINITY;

  const collateralUsd = (params.collateral * params.collateralPriceWad) / WAD;
  const debtUsd = (borrowAssets * params.loanPriceWad + WAD - 1n) / WAD;
  if (debtUsd === 0n) return Number.POSITIVE_INFINITY;
  return Number(collateralUsd * params.lltv) / Number(debtUsd * BPS);
}

async function main() {
  const cluster = parseClusterArg();
  const { payer, provider } = makeProvider(cluster);
  const program = makeProgram(provider);
  const methods = program.methods as any;

  const deployment = readJsonFile<DemoDeploymentFile>(DEMO_DEPLOYMENT_PATH);
  const wallets = readJsonFile<DemoWalletsFile>(DEMO_WALLETS_PATH);
  if (!deployment || !wallets?.liquidationTarget) {
    throw new Error("Run setup-demo-markets.ts and fund-demo.ts before staging liquidation.");
  }

  const marketKey = marketKeyArg?.split("=")[1] ?? "jup-usdc";
  const market = Object.values(deployment.markets).find(
    (entry) => entry.key === marketKey
  );
  if (!market) {
    throw new Error(`No market found for key ${marketKey}`);
  }

  const targetPrice =
    priceArg !== undefined
      ? Number.parseFloat(priceArg.split("=")[1])
      : restore
        ? market.collateralPriceUsd
        : market.key === "jup-usdc"
          ? 0.68
          : market.collateralPriceUsd * 0.8;

  const signature = await methods
    .setStaticOraclePrice(new BN(priceToWad(targetPrice, market.collateralDecimals).toString()))
    .accountsPartial({
      admin: payer.publicKey,
      oracle: new PublicKey(market.collateralOracle),
    })
    .rpc();

  const liquidationTarget = new PublicKey(wallets.liquidationTarget);
  const position = await program.account.position.fetch(
    derivePosition(Buffer.from(market.marketId, "hex"), liquidationTarget)
  );
  const marketAccount = await program.account.market.fetch(new PublicKey(market.market));
  const loanOracle = await program.account.staticOracle.fetch(
    new PublicKey(market.loanOracle)
  );

  const hf = computeHealthFactor({
    collateral: BigInt(position.collateral.toString()),
    borrowShares: BigInt(position.borrowShares.toString()),
    totalBorrowAssets: BigInt(marketAccount.totalBorrowAssets.toString()),
    totalBorrowShares: BigInt(marketAccount.totalBorrowShares.toString()),
    lltv: BigInt(marketAccount.lltv.toString()),
    collateralPriceWad: priceToWad(targetPrice, market.collateralDecimals),
    loanPriceWad: BigInt(loanOracle.priceWad.toString()),
  });

  console.log(`\n🎯 Liquidation staging updated`);
  console.log(`   Market: ${market.name}`);
  console.log(`   Oracle price: $${targetPrice}`);
  console.log(`   Liquidation target: ${liquidationTarget.toBase58()}`);
  console.log(`   Health factor: ${hf.toFixed(4)}`);
  console.log(`   Tx: ${signature}`);
}

main().catch((error) => {
  console.error("❌ Fatal:", error);
  process.exit(1);
});
