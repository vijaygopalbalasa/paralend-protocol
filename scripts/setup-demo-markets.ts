/**
 * setup-demo-markets.ts
 *
 * Creates 3 demo markets on devnet for the Nucleus demo:
 *   1. wSOL / USDC   (86% LLTV)
 *   2. JitoSOL / USDC (80% LLTV)
 *   3. JUP / USDC    (70% LLTV)
 *
 * Uses StaticOracle for all price feeds (no Pyth on devnet).
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/setup-demo-markets.ts [--cluster devnet|localnet]
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
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import type { Nucleus } from "../target/types/nucleus";
import IDL from "../target/idl/nucleus.json";

// ─── Config ────────────────────────────────────────────────────────────────────

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
const SEED_PROTOCOL = Buffer.from("protocol_state");
const SEED_MARKET = Buffer.from("market");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_LINEAR_IRM = Buffer.from("linear_irm");
const SEED_STATIC_ORACLE = Buffer.from("static_oracle");

function deriveProtocolState(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PROTOCOL],
    programId
  )[0];
}

function deriveLinearIrm(
  admin: PublicKey,
  nonce: bigint,
  programId: PublicKey
): PublicKey {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LINEAR_IRM, admin.toBuffer(), nonceBuf],
    programId
  )[0];
}

function deriveStaticOracle(feedId: Buffer, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_STATIC_ORACLE, feedId],
    programId
  )[0];
}

function deriveMarket(marketId: Buffer, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_MARKET, marketId],
    programId
  )[0];
}

// ─── Market ID ─────────────────────────────────────────────────────────────────

import { keccak_256 } from "@noble/hashes/sha3";

function computeMarketId(
  collateralMint: PublicKey,
  loanMint: PublicKey,
  collateralFeedId: Buffer,
  loanFeedId: Buffer,
  irm: PublicKey,
  lltv: bigint
): Buffer {
  const lltvBuf = Buffer.alloc(8);
  lltvBuf.writeBigUInt64LE(lltv);
  const data = Buffer.concat([
    collateralMint.toBuffer(),
    loanMint.toBuffer(),
    collateralFeedId,
    loanFeedId,
    irm.toBuffer(),
    lltvBuf,
  ]);
  return Buffer.from(keccak_256(data));
}

// ─── IRM params ────────────────────────────────────────────────────────────────

const WAD = BigInt("1000000000000000000");
const SECONDS_PER_YEAR = 31_536_000n;

function irmParams(
  baseRatePct: number,
  slope1Pct: number,
  slope2Pct: number,
  kinkPct: number
) {
  return {
    baseRate: BigInt(Math.floor((baseRatePct / 100) * Number(WAD))) / SECONDS_PER_YEAR,
    slope1: BigInt(Math.floor((slope1Pct / 100) * Number(WAD))) / SECONDS_PER_YEAR,
    slope2: BigInt(Math.floor((slope2Pct / 100) * Number(WAD))) / SECONDS_PER_YEAR,
    kink: BigInt(Math.floor((kinkPct / 100) * Number(WAD))),
  };
}

// ─── Demo market definitions ───────────────────────────────────────────────────

interface DemoMarket {
  name: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralDecimals: number;
  loanDecimals: number;
  collateralPriceUsd: number; // current price for static oracle
  loanPriceUsd: number;
  lltvBps: bigint;
  irmNonce: bigint;
  // per-second WAD-scaled IRM params
  baseRatePct: number;
  slope1Pct: number;
  slope2Pct: number;
  kinkPct: number;
  feeBps: bigint;
}

const DEMO_MARKETS: DemoMarket[] = [
  {
    name: "wSOL/USDC",
    collateralSymbol: "wSOL",
    loanSymbol: "USDC",
    collateralDecimals: 9,
    loanDecimals: 6,
    collateralPriceUsd: 165,  // $165 SOL
    loanPriceUsd: 1,
    lltvBps: 8600n,           // 86%
    irmNonce: 0n,
    baseRatePct: 0,
    slope1Pct: 5,
    slope2Pct: 230,
    kinkPct: 80,
    feeBps: 1000n,            // 10%
  },
  {
    name: "JitoSOL/USDC",
    collateralSymbol: "JitoSOL",
    loanSymbol: "USDC",
    collateralDecimals: 9,
    loanDecimals: 6,
    collateralPriceUsd: 180,  // ~$180 JitoSOL (slight premium to SOL)
    loanPriceUsd: 1,
    lltvBps: 8000n,           // 80%
    irmNonce: 1n,
    baseRatePct: 0,
    slope1Pct: 4,
    slope2Pct: 200,
    kinkPct: 80,
    feeBps: 1000n,
  },
  {
    name: "JUP/USDC",
    collateralSymbol: "JUP",
    loanSymbol: "USDC",
    collateralDecimals: 6,
    loanDecimals: 6,
    collateralPriceUsd: 0.80, // $0.80 JUP
    loanPriceUsd: 1,
    lltvBps: 7000n,           // 70%
    irmNonce: 2n,
    baseRatePct: 0,
    slope1Pct: 8,
    slope2Pct: 300,
    kinkPct: 75,
    feeBps: 1000n,
  },
];

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

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program<Nucleus>(IDL as any, provider);
  const payer = walletKeypair;

  console.log(`\n🚀 Nucleus Demo Market Setup`);
  console.log(`   Cluster: ${CLUSTER}`);
  console.log(`   RPC:     ${RPC_URL}`);
  console.log(`   Admin:   ${payer.publicKey.toBase58()}`);
  console.log(`   Program: ${PROGRAM_ID.toBase58()}\n`);

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`   Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.5e9) {
    console.error("❌ Insufficient balance. Fund with: solana airdrop 2");
    process.exit(1);
  }

  // ── 1. Initialize protocol (idempotent — skip if already exists) ──────────
  const protocolState = deriveProtocolState(PROGRAM_ID);
  const existingProtocol = await connection.getAccountInfo(protocolState);

  if (!existingProtocol) {
    console.log("📋 Initializing protocol...");
    await program.methods
      .initializeProtocol(payer.publicKey, payer.publicKey)
      .accounts({ payer: payer.publicKey, protocolState, systemProgram: SystemProgram.programId })
      .rpc();
    console.log(`   ✅ ProtocolState: ${protocolState.toBase58()}`);
  } else {
    console.log(`   ✅ Protocol already initialized: ${protocolState.toBase58()}`);
  }

  // ── 2. Enable LLTVs ───────────────────────────────────────────────────────
  const lltvsToEnable = [8600n, 8000n, 7000n];
  const protocolData = await program.account.protocolState.fetch(protocolState);
  const enabledLltvs = (protocolData.enabledLltvs as BN[])
    .slice(0, protocolData.lltvCount as number)
    .map((v) => BigInt(v.toString()));

  for (const lltv of lltvsToEnable) {
    if (!enabledLltvs.includes(lltv)) {
      await program.methods
        .enableLltv(new BN(lltv.toString()))
        .accounts({ owner: payer.publicKey, protocolState })
        .rpc();
      console.log(`   ✅ LLTV ${Number(lltv) / 100}% enabled`);
    } else {
      console.log(`   ✅ LLTV ${Number(lltv) / 100}% already enabled`);
    }
  }

  // ── 3. Create shared USDC mint (demo only) ────────────────────────────────
  console.log("\n💎 Creating demo token mints...");
  const mintsPath = path.join(__dirname, "demo-mints.json");
  let savedMints: Record<string, string> = {};
  if (fs.existsSync(mintsPath)) {
    savedMints = JSON.parse(fs.readFileSync(mintsPath, "utf-8"));
  }

  // One USDC mint shared across all markets
  let usdcMint: PublicKey;
  if (savedMints.usdc) {
    usdcMint = new PublicKey(savedMints.usdc);
    console.log(`   ✅ USDC mint (existing): ${usdcMint.toBase58()}`);
  } else {
    usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
    savedMints.usdc = usdcMint.toBase58();
    console.log(`   ✅ USDC mint (new):      ${usdcMint.toBase58()}`);
  }

  // Per-market collateral mints
  const collateralMints: PublicKey[] = [];
  for (const mkt of DEMO_MARKETS) {
    const key = `collateral_${mkt.collateralSymbol.toLowerCase()}`;
    let mint: PublicKey;
    if (savedMints[key]) {
      mint = new PublicKey(savedMints[key]);
      console.log(`   ✅ ${mkt.collateralSymbol} mint (existing): ${mint.toBase58()}`);
    } else {
      mint = await createMint(
        connection,
        payer,
        payer.publicKey,
        null,
        mkt.collateralDecimals
      );
      savedMints[key] = mint.toBase58();
      console.log(`   ✅ ${mkt.collateralSymbol} mint (new):      ${mint.toBase58()}`);
    }
    collateralMints.push(mint);
  }

  // Save mints for other scripts
  fs.writeFileSync(mintsPath, JSON.stringify(savedMints, null, 2));

  // ── 4. Create IRMs + StaticOracles + Markets ──────────────────────────────
  const deployedMarkets: Record<string, string> = {};

  console.log("\n🏗️  Creating markets...");
  for (let i = 0; i < DEMO_MARKETS.length; i++) {
    const mkt = DEMO_MARKETS[i];
    const collateralMint = collateralMints[i];
    const loanMint = usdcMint;

    console.log(`\n   [${i + 1}/3] ${mkt.name}`);

    // IRM
    const irmPda = deriveLinearIrm(payer.publicKey, mkt.irmNonce, PROGRAM_ID);
    const existingIrm = await connection.getAccountInfo(irmPda);
    if (!existingIrm) {
      const p = irmParams(mkt.baseRatePct, mkt.slope1Pct, mkt.slope2Pct, mkt.kinkPct);
      await program.methods
        .createIrm(
          new BN(p.baseRate.toString()),
          new BN(p.slope1.toString()),
          new BN(p.slope2.toString()),
          new BN(p.kink.toString()),
          new BN(mkt.irmNonce.toString())
        )
        .accounts({ payer: payer.publicKey, irm: irmPda, systemProgram: SystemProgram.programId })
        .rpc();
      console.log(`     ✅ IRM: ${irmPda.toBase58()}`);
    } else {
      console.log(`     ✅ IRM (existing): ${irmPda.toBase58()}`);
    }

    // Enable IRM (idempotent-ish — ignore error if already enabled)
    try {
      const pd = await program.account.protocolState.fetch(protocolState);
      const enabledIrms = (pd.enabledIrms as PublicKey[]).slice(0, pd.irmCount as number);
      if (!enabledIrms.some((k) => k.equals(irmPda))) {
        await program.methods
          .enableIrm(irmPda)
          .accounts({ owner: payer.publicKey, protocolState })
          .rpc();
        console.log(`     ✅ IRM enabled`);
      }
    } catch {
      // already enabled
    }

    // StaticOracle — use a deterministic feed ID based on index
    const collateralFeedId = Buffer.alloc(32);
    collateralFeedId.writeUInt8(i + 1, 0); // 0x01, 0x02, 0x03
    const loanFeedId = Buffer.alloc(32); // all-zeros = stablecoin

    const collateralOracle = deriveStaticOracle(collateralFeedId, PROGRAM_ID);
    const loanOracle = deriveStaticOracle(loanFeedId, PROGRAM_ID);

    // collateral oracle
    const existingColOracle = await connection.getAccountInfo(collateralOracle);
    if (!existingColOracle) {
      const priceWad = BigInt(
        Math.floor(mkt.collateralPriceUsd * Number(WAD) / 10 ** mkt.collateralDecimals)
      );
      await program.methods
        .createStaticOracle(Array.from(collateralFeedId), new BN(priceWad.toString()))
        .accounts({ payer: payer.publicKey, oracle: collateralOracle, systemProgram: SystemProgram.programId })
        .rpc();
      console.log(`     ✅ Collateral oracle @ $${mkt.collateralPriceUsd}: ${collateralOracle.toBase58()}`);
    } else {
      console.log(`     ✅ Collateral oracle (existing): ${collateralOracle.toBase58()}`);
    }

    // loan oracle (all-zeros feed = stablecoin, $1 = 1e18 / 1e6 per base unit)
    const existingLoanOracle = await connection.getAccountInfo(loanOracle);
    if (!existingLoanOracle) {
      const loanPriceWad = WAD / BigInt(10 ** mkt.loanDecimals);
      await program.methods
        .createStaticOracle(Array.from(loanFeedId), new BN(loanPriceWad.toString()))
        .accounts({ payer: payer.publicKey, oracle: loanOracle, systemProgram: SystemProgram.programId })
        .rpc();
      console.log(`     ✅ Loan oracle (stablecoin $1): ${loanOracle.toBase58()}`);
    } else {
      console.log(`     ✅ Loan oracle (existing): ${loanOracle.toBase58()}`);
    }

    // Market
    const marketId = computeMarketId(
      collateralMint,
      loanMint,
      collateralFeedId,
      loanFeedId,
      irmPda,
      mkt.lltvBps
    );
    const marketPda = deriveMarket(marketId, PROGRAM_ID);
    const existingMarket = await connection.getAccountInfo(marketPda);

    if (!existingMarket) {
      await program.methods
        .createMarket(
          Array.from(marketId) as unknown as number[] & { length: 32 },
          Array.from(collateralFeedId) as unknown as number[] & { length: 32 },
          Array.from(loanFeedId) as unknown as number[] & { length: 32 },
          irmPda,
          new BN(mkt.lltvBps.toString()),
          new BN(mkt.feeBps.toString())
        )
        .accounts({
          payer: payer.publicKey,
          protocolState,
          collateralMint,
          loanMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log(`     ✅ Market created: ${marketPda.toBase58()}`);
    } else {
      console.log(`     ✅ Market (existing): ${marketPda.toBase58()}`);
    }

    deployedMarkets[mkt.name] = marketPda.toBase58();
    deployedMarkets[`${mkt.name}.marketId`] = marketId.toString("hex");
    deployedMarkets[`${mkt.name}.collateralMint`] = collateralMint.toBase58();
    deployedMarkets[`${mkt.name}.loanMint`] = loanMint.toBase58();
    deployedMarkets[`${mkt.name}.irm`] = irmPda.toBase58();
    deployedMarkets[`${mkt.name}.collateralOracle`] = collateralOracle.toBase58();
    deployedMarkets[`${mkt.name}.loanOracle`] = loanOracle.toBase58();
  }

  // Save deployment info
  const deployPath = path.join(__dirname, "demo-deployment.json");
  fs.writeFileSync(deployPath, JSON.stringify(deployedMarkets, null, 2));

  console.log("\n✅ All markets deployed!");
  console.log(`   Deployment info saved to: ${deployPath}`);
  console.log("\n📊 Summary:");
  for (const mkt of DEMO_MARKETS) {
    console.log(`   ${mkt.name}: ${deployedMarkets[mkt.name]}`);
  }
  console.log("\n▶️  Next: npx ts-node scripts/fund-demo.ts");
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
