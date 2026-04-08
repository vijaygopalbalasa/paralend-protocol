/**
 * liquidation-bot.ts
 *
 * Monitors all Nucleus positions and liquidates unhealthy ones.
 * Polls every 10 seconds (configurable with --interval=<ms>).
 *
 * Strategy:
 * - Fetch all Position accounts from the program
 * - For each position with borrow_shares > 0, compute health factor
 * - If HF < 1.0, attempt liquidation (seize 50% of collateral)
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/liquidation-bot.ts [--cluster devnet|localnet] [--interval=10000]
 *
 * Requires:
 *   - Liquidator wallet with sufficient USDC and SOL for gas
 *   - demo-deployment.json from setup-demo-markets.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import type { Nucleus } from "../target/types/nucleus";
import IDL from "../target/idl/nucleus.json";

const PROGRAM_ID = new PublicKey(
  "BDZo1obAjSPufJsRqJmBy82whgQfedDXnTDipdA2nCVn"
);

const args = process.argv.slice(2);
const clusterArg = args.find((a) => a.startsWith("--cluster="))?.split("=")[1];
const intervalArg = args.find((a) => a.startsWith("--interval="))?.split("=")[1];
const CLUSTER = (clusterArg ?? "devnet") as "devnet" | "localnet";
const POLL_INTERVAL_MS = parseInt(intervalArg ?? "10000", 10);

const RPC_URL =
  CLUSTER === "localnet"
    ? "http://127.0.0.1:8899"
    : process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";

// ─── Seeds ─────────────────────────────────────────────────────────────────────

const SEED_PREFIX = Buffer.from("nucleus");
const SEED_MARKET = Buffer.from("market");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_STATIC_ORACLE = Buffer.from("static_oracle");

function deriveLoanVault(marketId: Buffer, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LOAN_VAULT, marketId],
    programId
  )[0];
}

function deriveCollateralVault(marketId: Buffer, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_COLLATERAL_VAULT, marketId],
    programId
  )[0];
}

// ─── Math (mirrors on-chain) ───────────────────────────────────────────────────

const WAD = BigInt("1000000000000000000");
const BPS_N = 10_000n;
const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1n;

function toAssetsUp(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = totalShares + VIRTUAL_SHARES;
  return (num + den - 1n) / den;
}

function healthFactor(
  collateral: bigint,
  borrowShares: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
  lltv: bigint,
  collateralPriceWad: bigint,
  loanPriceWad: bigint
): number {
  if (borrowShares === 0n) return Infinity;
  const borrowAssets = toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares);
  if (borrowAssets === 0n) return Infinity;

  const collateralUsd = (collateral * collateralPriceWad) / WAD;
  const loanUsd = (borrowAssets * loanPriceWad + WAD - 1n) / WAD;

  if (loanUsd === 0n) return Infinity;
  return Number(collateralUsd * lltv) / Number(loanUsd * BPS_N);
}

// ─── Main bot loop ─────────────────────────────────────────────────────────────

let isRunning = false;
let iteration = 0;

async function scanAndLiquidate(
  program: Program<Nucleus>,
  provider: AnchorProvider,
  payer: Keypair,
  deployment: Record<string, string>,
  mints: Record<string, string>
) {
  const connection = provider.connection;
  const usdcMint = new PublicKey(mints.usdc);

  // Ensure liquidator has USDC (on localnet we can mint; devnet assumes pre-funded)
  const liquidatorUsdcAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    usdcMint,
    payer.publicKey
  );

  // Fetch all Position accounts
  const allPositions = await program.account.position.all();
  const withDebt = allPositions.filter(
    (p) => BigInt(p.account.borrowShares.toString()) > 0n
  );

  if (withDebt.length === 0) {
    process.stdout.write(`\r[${new Date().toISOString()}] Scan #${iteration}: 0 indebted positions`);
    return;
  }

  console.log(
    `\n[${new Date().toISOString()}] Scan #${iteration}: ${withDebt.length} position(s) with debt`
  );

  for (const pos of withDebt) {
    const { account } = pos;
    const marketIdBuf = Buffer.from(account.marketId as number[]);
    const marketIdHex = marketIdBuf.toString("hex");

    // Find matching deployment entry
    const marketEntry = Object.entries(deployment).find(
      ([k, v]) => k.endsWith(".marketId") && v === marketIdHex
    );
    if (!marketEntry) continue;

    const marketName = marketEntry[0].replace(".marketId", "");
    const marketPda = new PublicKey(deployment[marketName]);
    const collateralMintPk = new PublicKey(deployment[`${marketName}.collateralMint`]);
    const irmPda = new PublicKey(deployment[`${marketName}.irm`]);
    const collateralOracle = new PublicKey(deployment[`${marketName}.collateralOracle`]);
    const loanOracle = new PublicKey(deployment[`${marketName}.loanOracle`]);

    // Fetch current market state + oracle prices
    const market = await program.account.market.fetch(marketPda);
    const colOracleData = await program.account.staticOracle.fetch(collateralOracle);
    const loanOracleData = await program.account.staticOracle.fetch(loanOracle);

    const collateralPriceWad = BigInt(colOracleData.priceWad.toString());
    const loanPriceWad = BigInt(loanOracleData.priceWad.toString());

    const hf = healthFactor(
      BigInt(account.collateral.toString()),
      BigInt(account.borrowShares.toString()),
      BigInt(market.totalBorrowAssets.toString()),
      BigInt(market.totalBorrowShares.toString()),
      BigInt(market.lltv.toString()),
      collateralPriceWad,
      loanPriceWad
    );

    const owner = account.owner as PublicKey;
    console.log(
      `   [${marketName}] Position ${pos.publicKey.toBase58().slice(0, 8)} (owner: ${owner.toBase58().slice(0, 8)}) HF=${hf.toFixed(4)}`
    );

    if (hf >= 1.0) continue; // healthy

    console.log(`   ⚠️  UNHEALTHY (HF=${hf.toFixed(4)}) — liquidating...`);

    // Seize up to 50% of collateral
    const collateral = BigInt(account.collateral.toString());
    const seizeAmount = collateral / 2n;
    if (seizeAmount === 0n) {
      console.log(`   ⚠️  No collateral to seize, skipping`);
      continue;
    }

    // Ensure liquidator has token accounts
    const liquidatorColAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      collateralMintPk,
      payer.publicKey
    );

    const loanVault = deriveLoanVault(marketIdBuf, PROGRAM_ID);
    const collateralVault = deriveCollateralVault(marketIdBuf, PROGRAM_ID);

    try {
      const tx = await (program.methods as any)
        .liquidate(Array.from(marketIdBuf), new BN(seizeAmount.toString()))
        .accountsStrict({
          liquidator: payer.publicKey,
          market: marketPda,
          irm: irmPda,
          borrowerPosition: pos.publicKey,
          borrower: owner,
          liquidatorLoanAta: liquidatorUsdcAta.address,
          loanVault,
          collateralVault,
          liquidatorCollateralAta: liquidatorColAta.address,
          collateralOracle,
          loanOracle,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      console.log(`   ✅ Liquidated! tx: ${tx}`);
    } catch (err: any) {
      console.error(`   ❌ Liquidation failed: ${err.message}`);
    }
  }
}

async function main() {
  const walletPath =
    process.env.ANCHOR_WALLET ??
    path.join(process.env.HOME ?? "~", ".config", "solana", "id.json");
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  const payer = walletKeypair;

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program<Nucleus>(IDL as any, provider);

  const deployPath = path.join(__dirname, "demo-deployment.json");
  const mintsPath = path.join(__dirname, "demo-mints.json");
  if (!fs.existsSync(deployPath) || !fs.existsSync(mintsPath)) {
    console.error("❌ Run setup-demo-markets.ts and fund-demo.ts first.");
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(deployPath, "utf-8"));
  const mints = JSON.parse(fs.readFileSync(mintsPath, "utf-8"));

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`\n🤖 Nucleus Liquidation Bot`);
  console.log(`   Cluster:  ${CLUSTER}`);
  console.log(`   Wallet:   ${payer.publicKey.toBase58()}`);
  console.log(`   Balance:  ${(balance / 1e9).toFixed(4)} SOL`);
  console.log(`   Interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`   Watching ${Object.keys(deployment).filter((k) => !k.includes(".")).length} markets\n`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n👋 Bot shutting down...");
    process.exit(0);
  });

  // First scan immediately, then poll
  const loop = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await scanAndLiquidate(program, provider, payer, deployment, mints);
    } catch (err: any) {
      console.error(`\n[ERROR] ${err.message}`);
    } finally {
      iteration++;
      isRunning = false;
    }
  };

  await loop();
  setInterval(loop, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
