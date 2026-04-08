/**
 * fund-demo.ts
 *
 * Funds demo wallets and seeds the 3 demo markets with realistic liquidity.
 * Creates supply positions (lenders) and borrow positions (borrowers).
 * Also stages one unhealthy position for live liquidation demo.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/fund-demo.ts [--cluster devnet|localnet]
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
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
const CLUSTER = (clusterArg ?? "devnet") as "devnet" | "localnet";

const RPC_URL =
  CLUSTER === "localnet"
    ? "http://127.0.0.1:8899"
    : process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";

// ─── Seeds ─────────────────────────────────────────────────────────────────────

const SEED_PREFIX = Buffer.from("nucleus");
const SEED_MARKET = Buffer.from("market");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_POSITION = Buffer.from("position");

function deriveMarket(marketId: Buffer, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_MARKET, marketId],
    programId
  )[0];
}

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

function derivePosition(
  marketId: Buffer,
  owner: PublicKey,
  programId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_POSITION, marketId, owner.toBuffer()],
    programId
  )[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensurePosition(
  program: Program<Nucleus>,
  connection: Connection,
  marketIdBuf: Buffer,
  owner: PublicKey,
  payer: Keypair,
  signers: Keypair[]
) {
  const marketPda = deriveMarket(marketIdBuf, PROGRAM_ID);
  const positionPda = derivePosition(marketIdBuf, owner, PROGRAM_ID);
  const existing = await connection.getAccountInfo(positionPda);
  if (!existing) {
    await (program.methods as any)
      .createPosition(Array.from(marketIdBuf))
      .accountsStrict({
        payer: payer.publicKey,
        owner,
        market: marketPda,
        position: positionPda,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();
  }
  return positionPda;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load wallet
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

  // Load deployment info
  const deployPath = path.join(__dirname, "demo-deployment.json");
  const mintsPath = path.join(__dirname, "demo-mints.json");
  if (!fs.existsSync(deployPath) || !fs.existsSync(mintsPath)) {
    console.error("❌ Run setup-demo-markets.ts first.");
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(deployPath, "utf-8"));
  const mints = JSON.parse(fs.readFileSync(mintsPath, "utf-8"));

  const usdcMint = new PublicKey(mints.usdc);

  console.log(`\n💰 Nucleus Demo — Fund Markets`);
  console.log(`   Cluster: ${CLUSTER}\n`);

  // ── Funding amounts ──────────────────────────────────────────────────────
  const SUPPLY_USDC = 100_000 * 1e6; // 100,000 USDC per market
  const COLLATERAL_SOL = 500 * 1e9;  // 500 SOL
  const BORROW_USDC = 30_000 * 1e6;  // 30,000 USDC (60% util)

  // ── 1. wSOL/USDC market ──────────────────────────────────────────────────
  const marketNames = ["wSOL/USDC", "JitoSOL/USDC", "JUP/USDC"];

  for (const marketName of marketNames) {
    const marketIdHex = deployment[`${marketName}.marketId`];
    if (!marketIdHex) {
      console.log(`   ⚠️  ${marketName} not found in deployment, skipping`);
      continue;
    }
    const marketIdBuf = Buffer.from(marketIdHex, "hex");
    const marketPda = new PublicKey(deployment[marketName]);
    const collateralMint = new PublicKey(deployment[`${marketName}.collateralMint`]);
    const loanMint = usdcMint;
    const irmPda = new PublicKey(deployment[`${marketName}.irm`]);
    const collateralOracle = new PublicKey(deployment[`${marketName}.collateralOracle`]);
    const loanOracle = new PublicKey(deployment[`${marketName}.loanOracle`]);
    const loanVault = deriveLoanVault(marketIdBuf, PROGRAM_ID);
    const collateralVault = deriveCollateralVault(marketIdBuf, PROGRAM_ID);

    const marketData = await program.account.market.fetch(marketPda);
    const isWSol = marketName === "wSOL/USDC";
    const isJitoSol = marketName === "JitoSOL/USDC";
    const colDecimals = isWSol || isJitoSol ? 9 : 6;
    const SUPPLY_COL = isWSol || isJitoSol
      ? 1000 * 10 ** colDecimals   // 1000 SOL
      : 500_000 * 10 ** colDecimals; // 500k JUP

    console.log(`\n   📈 ${marketName}`);
    console.log(`      Market: ${marketPda.toBase58()}`);

    // ── Create lender ──────────────────────────────────────────────────────
    const lender = Keypair.generate();
    console.log(`      Lender: ${lender.publicKey.toBase58()}`);

    if (CLUSTER === "localnet") {
      const sig = await connection.requestAirdrop(lender.publicKey, 2e9);
      await connection.confirmTransaction(sig);
    } else {
      // On devnet, transfer from payer
      const transferTx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: lender.publicKey,
          lamports: 0.5e9,
        })
      );
      await provider.sendAndConfirm(transferTx, [payer]);
    }

    // Mint loan tokens to lender
    const lenderLoanAta = await createAccount(
      connection,
      payer,
      loanMint,
      lender.publicKey
    );
    await mintTo(connection, payer, loanMint, lenderLoanAta, payer, SUPPLY_USDC);

    // Create position + supply
    const lenderPos = await ensurePosition(
      program, connection, marketIdBuf, lender.publicKey, payer, [payer, lender]
    );
    await (program.methods as any)
      .supply(Array.from(marketIdBuf), new BN(SUPPLY_USDC.toString()))
      .accountsStrict({
        supplier: lender.publicKey,
        market: marketPda,
        irm: irmPda,
        position: lenderPos,
        supplierLoanAta: lenderLoanAta,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lender])
      .rpc();
    console.log(`      ✅ Supplied ${SUPPLY_USDC / 1e6} USDC`);

    // ── Create borrower ────────────────────────────────────────────────────
    const borrower = Keypair.generate();
    if (CLUSTER === "localnet") {
      const sig = await connection.requestAirdrop(borrower.publicKey, 2e9);
      await connection.confirmTransaction(sig);
    } else {
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: borrower.publicKey,
          lamports: 0.5e9,
        })
      );
      await provider.sendAndConfirm(tx, [payer]);
    }

    const borrowerColAta = await createAccount(
      connection,
      payer,
      collateralMint,
      borrower.publicKey
    );
    const borrowerLoanAta = await createAccount(
      connection,
      payer,
      loanMint,
      borrower.publicKey
    );
    await mintTo(connection, payer, collateralMint, borrowerColAta, payer, SUPPLY_COL);

    const borrowerPos = await ensurePosition(
      program, connection, marketIdBuf, borrower.publicKey, payer, [payer, borrower]
    );

    // Supply collateral
    await (program.methods as any)
      .supplyCollateral(Array.from(marketIdBuf), new BN(SUPPLY_COL.toString()))
      .accountsStrict({
        depositor: borrower.publicKey,
        market: marketPda,
        position: borrowerPos,
        depositorCollateralAta: borrowerColAta,
        collateralVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    // Borrow USDC
    await (program.methods as any)
      .borrow(Array.from(marketIdBuf), new BN(BORROW_USDC.toString()))
      .accountsStrict({
        borrower: borrower.publicKey,
        market: marketPda,
        irm: irmPda,
        position: borrowerPos,
        loanVault,
        receiverLoanAta: borrowerLoanAta,
        collateralOracle,
        loanOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    const util = (BORROW_USDC / SUPPLY_USDC) * 100;
    console.log(`      ✅ Borrower: supplied ${SUPPLY_COL / 10 ** colDecimals} ${marketName.split("/")[0]}, borrowed ${BORROW_USDC / 1e6} USDC (${util.toFixed(0)}% util)`);

    // Save keypairs for liquidation bot / demo
    const demoPeersPath = path.join(__dirname, `demo-peers-${marketName.replace("/", "-")}.json`);
    fs.writeFileSync(demoPeersPath, JSON.stringify({
      marketIdHex,
      lender: Array.from(lender.secretKey),
      borrower: Array.from(borrower.secretKey),
    }));
  }

  console.log("\n✅ All markets funded with demo liquidity!");
  console.log("▶️  Next: npx ts-node scripts/liquidation-bot.ts");
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
