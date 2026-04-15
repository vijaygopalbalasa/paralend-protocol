import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3";
import { assert } from "chai";
import { Nucleus } from "../target/types/nucleus";

// ─── Seeds ───────────────────────────────────────────────────────────────────

const SEED_PREFIX = Buffer.from("nucleus");
const SEED_PROTOCOL = Buffer.from("protocol_state");
const SEED_MARKET = Buffer.from("market");
const SEED_POSITION = Buffer.from("position");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_LINEAR_IRM = Buffer.from("linear_irm");
const SEED_STATIC_ORACLE = Buffer.from("static_oracle");

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function deriveProtocolState(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PROTOCOL],
    programId
  );
}

function deriveMarket(marketId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_MARKET, marketId],
    programId
  );
}

function deriveCollateralVault(marketId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_COLLATERAL_VAULT, marketId],
    programId
  );
}

function deriveLoanVault(marketId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LOAN_VAULT, marketId],
    programId
  );
}

function derivePosition(marketId: Buffer, owner: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_POSITION, marketId, owner.toBuffer()],
    programId
  );
}

function deriveLinearIrm(admin: PublicKey, nonce: bigint, programId: PublicKey): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_LINEAR_IRM, admin.toBuffer(), nonceBuf],
    programId
  );
}

function deriveStaticOracle(feedId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_STATIC_ORACLE, feedId],
    programId
  );
}

// ─── Market ID ───────────────────────────────────────────────────────────────

function computeMarketId(
  collateralMint: PublicKey,
  loanMint: PublicKey,
  collateralOracleFeedId: Buffer,
  loanOracleFeedId: Buffer,
  irm: PublicKey,
  lltv: bigint
): Buffer {
  const llltvBuf = Buffer.alloc(8);
  llltvBuf.writeBigUInt64LE(lltv);

  const data = Buffer.concat([
    collateralMint.toBuffer(),    // 32
    loanMint.toBuffer(),          // 32
    collateralOracleFeedId,       // 32
    loanOracleFeedId,             // 32
    irm.toBuffer(),               // 32
    llltvBuf,                     // 8
  ]); // = 168 bytes

  return Buffer.from(keccak_256(data));
}

// ─── Test constants ───────────────────────────────────────────────────────────

const WAD = BigInt("1000000000000000000"); // 1e18
const BPS = 10_000n;

// Market params
const LLTV = 8600n; // 86%
const FEE_BPS = 1000n; // 10%
const IRM_NONCE = 0n;

// Oracle prices (per base unit, WAD-scaled)
// SOL at $140, 9 decimals: $140 * 1e18 / 1e9 = 140_000_000_000
const SOL_PRICE_WAD = (140n * WAD) / 1_000_000_000n;
// USDC at $1, 6 decimals: $1 * 1e18 / 1e6 = 1_000_000_000_000
const USDC_PRICE_WAD = WAD / 1_000_000n;

// Feed IDs (arbitrary test values)
const COLLATERAL_FEED_ID = Buffer.alloc(32, 1); // all 0x01
const LOAN_FEED_ID = Buffer.alloc(32, 0);       // all zeros = stablecoin

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("nucleus", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Nucleus as Program<Nucleus>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // Test accounts
  let collateralMint: PublicKey;
  let loanMint: PublicKey;
  let lenderLoanAta: PublicKey;
  let borrowerCollateralAta: PublicKey;
  let borrowerLoanAta: PublicKey;
  let liquidatorLoanAta: PublicKey;
  let liquidatorCollateralAta: PublicKey;

  const lender = Keypair.generate();
  const borrower = Keypair.generate();
  const liquidator = Keypair.generate();

  let protocolState: PublicKey;
  let irmPda: PublicKey;
  let marketId: Buffer;
  let market: PublicKey;
  let collateralVault: PublicKey;
  let loanVault: PublicKey;
  let lenderPosition: PublicKey;
  let borrowerPosition: PublicKey;
  let liquidatorPosition: PublicKey;
  let collateralOracle: PublicKey;
  let loanOracle: PublicKey;

  // Token amounts (using small decimals for test simplicity)
  const COLLATERAL_DECIMALS = 9; // like SOL
  const LOAN_DECIMALS = 6;       // like USDC
  const SUPPLY_AMOUNT = 10_000 * 10 ** LOAN_DECIMALS;         // 10,000 USDC
  const COLLATERAL_AMOUNT = 100 * 10 ** COLLATERAL_DECIMALS;  // 100 SOL
  const BORROW_AMOUNT = 5_000 * 10 ** LOAN_DECIMALS;          // 5,000 USDC

  // ─── Setup ─────────────────────────────────────────────────────────────────

  before(async () => {
    // Fund test wallets
    for (const kp of [lender, borrower, liquidator]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * 1e9);
      await connection.confirmTransaction(sig);
    }

    // Create token mints
    collateralMint = await createMint(
      connection, payer, payer.publicKey, null, COLLATERAL_DECIMALS
    );
    loanMint = await createMint(
      connection, payer, payer.publicKey, null, LOAN_DECIMALS
    );

    // Create token accounts
    lenderLoanAta = await createAccount(connection, payer, loanMint, lender.publicKey);
    borrowerCollateralAta = await createAccount(connection, payer, collateralMint, borrower.publicKey);
    borrowerLoanAta = await createAccount(connection, payer, loanMint, borrower.publicKey);
    liquidatorLoanAta = await createAccount(connection, payer, loanMint, liquidator.publicKey);
    liquidatorCollateralAta = await createAccount(connection, payer, collateralMint, liquidator.publicKey);

    // Mint tokens
    await mintTo(connection, payer, loanMint, lenderLoanAta, payer, SUPPLY_AMOUNT * 2);
    await mintTo(connection, payer, collateralMint, borrowerCollateralAta, payer, COLLATERAL_AMOUNT * 2);
    // Mint a small buffer to borrower for loan repayment (to_assets_up rounds up by 1 micro-unit)
    await mintTo(connection, payer, loanMint, borrowerLoanAta, payer, 10_000);
    await mintTo(connection, payer, loanMint, liquidatorLoanAta, payer, SUPPLY_AMOUNT * 2); // for liquidation repayment

    // Derive PDAs
    [protocolState] = deriveProtocolState(program.programId);
    [irmPda] = deriveLinearIrm(payer.publicKey, IRM_NONCE, program.programId);
    [collateralOracle] = deriveStaticOracle(COLLATERAL_FEED_ID, program.programId);
    [loanOracle] = deriveStaticOracle(LOAN_FEED_ID, program.programId);
  });

  // ─── 1. Protocol initialization ────────────────────────────────────────────

  it("initializes the protocol", async () => {
    // Check if already initialized (idempotent for multi-file test runs)
    const existing = await connection.getAccountInfo(protocolState);
    if (existing) {
      const state = await program.account.protocolState.fetch(protocolState);
      assert.equal(state.owner.toBase58(), payer.publicKey.toBase58());
      console.log("  Protocol already initialized, skipping creation");
      return;
    }

    await program.methods
      .initializeProtocol(payer.publicKey, payer.publicKey)
      .accounts({
        payer: payer.publicKey,
        protocolState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.owner.toBase58(), payer.publicKey.toBase58());
  });

  // ─── 2. Enable LLTV ────────────────────────────────────────────────────────

  it("enables LLTV 86%", async () => {
    const stateBefore = await program.account.protocolState.fetch(protocolState);
    const lltvCountBefore = stateBefore.lltvCount;

    // Check if already enabled
    if (stateBefore.enabledLltvs.slice(0, lltvCountBefore).some(
      (v: anchor.BN) => v.eq(new BN(LLTV.toString()))
    )) {
      console.log("  LLTV 86% already enabled, skipping");
      return;
    }

    await program.methods
      .enableLltv(new BN(LLTV.toString()))
      .accounts({
        owner: payer.publicKey,
        protocolState,
      })
      .rpc();

    const stateAfter = await program.account.protocolState.fetch(protocolState);
    assert.equal(stateAfter.lltvCount, lltvCountBefore + 1);
  });

  // ─── 3. Create IRM ─────────────────────────────────────────────────────────

  it("creates a kinked IRM", async () => {
    // Check if already exists
    const existing = await connection.getAccountInfo(irmPda);
    if (existing) {
      const irm = await program.account.linearIrm.fetch(irmPda);
      console.log("  IRM already exists, skipping creation");
      assert.isTrue(irm.kink.gt(new BN(0)), "IRM should have valid kink");
      return;
    }

    const secondsPerYear = 31_536_000n;
    const baseRate = 0n;
    const slope1 = (WAD * 5n) / 100n / secondsPerYear;     // 5% APY below kink
    const slope2 = (WAD * 230n) / 100n / secondsPerYear;   // 230% APY above kink
    const kink = (WAD * 80n) / 100n;                       // 80% utilization

    await program.methods
      .createIrm(
        new BN(baseRate.toString()),
        new BN(slope1.toString()),
        new BN(slope2.toString()),
        new BN(kink.toString()),
        new BN(IRM_NONCE.toString())
      )
      .accounts({
        payer: payer.publicKey,
        irm: irmPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const irm = await program.account.linearIrm.fetch(irmPda);
    assert.equal(irm.kink.toString(), kink.toString());
  });

  // ─── 4. Enable IRM ─────────────────────────────────────────────────────────

  it("enables the IRM", async () => {
    const stateBefore = await program.account.protocolState.fetch(protocolState);
    const irmCountBefore = stateBefore.irmCount;

    // Check if already enabled
    if (stateBefore.enabledIrms.slice(0, irmCountBefore).some(
      (v: PublicKey) => v.equals(irmPda)
    )) {
      console.log("  IRM already enabled, skipping");
      return;
    }

    await program.methods
      .enableIrm(irmPda)
      .accounts({
        owner: payer.publicKey,
        protocolState,
      })
      .rpc();

    const stateAfter = await program.account.protocolState.fetch(protocolState);
    assert.equal(stateAfter.irmCount, irmCountBefore + 1);
  });

  // ─── 5. Create static oracles ──────────────────────────────────────────────

  it("creates collateral oracle (SOL at $140)", async () => {
    // Check if already exists
    const existing = await connection.getAccountInfo(collateralOracle);
    if (existing) {
      const oracle = await program.account.staticOracle.fetch(collateralOracle);
      console.log("  Collateral oracle already exists, skipping creation");
      assert.isTrue(oracle.priceWad.gt(new BN(0)), "oracle should have valid price");
      return;
    }

    await program.methods
      .createStaticOracle(
        Array.from(COLLATERAL_FEED_ID),
        new BN(SOL_PRICE_WAD.toString())
      )
      .accounts({
        payer: payer.publicKey,
        oracle: collateralOracle,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const oracle = await program.account.staticOracle.fetch(collateralOracle);
    assert.equal(oracle.priceWad.toString(), SOL_PRICE_WAD.toString());
  });

  it("creates loan oracle (stablecoin feed, all-zeros)", async () => {
    // Check if already exists
    const existing = await connection.getAccountInfo(loanOracle);
    if (existing) {
      console.log("  Loan oracle already exists, skipping creation");
      return;
    }

    await program.methods
      .createStaticOracle(
        Array.from(LOAN_FEED_ID),
        new BN(USDC_PRICE_WAD.toString())
      )
      .accounts({
        payer: payer.publicKey,
        oracle: loanOracle,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  // ─── 6. Create market ──────────────────────────────────────────────────────

  it("creates a SOL/USDC market", async () => {
    marketId = computeMarketId(
      collateralMint,
      loanMint,
      COLLATERAL_FEED_ID,
      LOAN_FEED_ID,
      irmPda,
      LLTV
    );

    [market] = deriveMarket(marketId, program.programId);
    [collateralVault] = deriveCollateralVault(marketId, program.programId);
    [loanVault] = deriveLoanVault(marketId, program.programId);

    // Check if already exists (idempotent)
    const existing = await connection.getAccountInfo(market);
    if (existing) {
      const mkt = await program.account.market.fetch(market);
      console.log("  Market already exists, skipping creation");
      assert.equal(mkt.lltv.toString(), LLTV.toString());
      return;
    }

    await program.methods
      .createMarket(
        Array.from(marketId),
        Array.from(COLLATERAL_FEED_ID),
        Array.from(LOAN_FEED_ID),
        irmPda,
        new BN(LLTV.toString()),
        new BN(FEE_BPS.toString())
      )
      .accounts({
        payer: payer.publicKey,
        protocolState,
        collateralMint,
        loanMint,
        irmAccount: irmPda,
        market,
        collateralVault,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const mkt = await program.account.market.fetch(market);
    assert.equal(mkt.lltv.toString(), LLTV.toString());
    assert.equal(mkt.fee.toString(), FEE_BPS.toString());
  });

  // ─── 7. Create positions ───────────────────────────────────────────────────

  it("creates positions for lender and borrower", async () => {
    [lenderPosition] = derivePosition(marketId, lender.publicKey, program.programId);
    [borrowerPosition] = derivePosition(marketId, borrower.publicKey, program.programId);
    [liquidatorPosition] = derivePosition(marketId, liquidator.publicKey, program.programId);

    for (const [owner, pos] of [
      [lender, lenderPosition],
      [borrower, borrowerPosition],
      [liquidator, liquidatorPosition],
    ] as [Keypair, PublicKey][]) {
      await program.methods
        .createPosition(Array.from(marketId))
        .accounts({
          payer: owner.publicKey,
          market,
          position: pos,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    }

    const pos = await program.account.position.fetch(lenderPosition);
    assert.equal(pos.owner.toBase58(), lender.publicKey.toBase58());
    assert.equal(pos.supplyShares.toString(), "0");
  });

  // ─── 8. Supply loan tokens (lender) ────────────────────────────────────────

  it("lender supplies 10,000 USDC", async () => {
    await program.methods
      .supply(Array.from(marketId), new BN(SUPPLY_AMOUNT), new BN(0))
      .accounts({
        supplier: lender.publicKey,
        market,
        irm: irmPda,
        position: lenderPosition,
        supplierLoanAta: lenderLoanAta,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lender])
      .rpc();

    const mkt = await program.account.market.fetch(market);
    assert.equal(mkt.totalSupplyAssets.toString(), SUPPLY_AMOUNT.toString());
    assert.isTrue(BigInt(mkt.totalSupplyShares.toString()) > 0n, "shares > 0");

    const pos = await program.account.position.fetch(lenderPosition);
    assert.isTrue(BigInt(pos.supplyShares.toString()) > 0n, "lender has shares");
    console.log(`  Lender supply shares: ${pos.supplyShares.toString()}`);
  });

  // ─── 9. Supply collateral (borrower) ───────────────────────────────────────

  it("borrower supplies 100 SOL as collateral", async () => {
    await program.methods
      .supplyCollateral(Array.from(marketId), new BN(COLLATERAL_AMOUNT))
      .accounts({
        depositor: borrower.publicKey,
        market,
        position: borrowerPosition,
        depositorCollateralAta: borrowerCollateralAta,
        collateralVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    const pos = await program.account.position.fetch(borrowerPosition);
    assert.equal(pos.collateral.toString(), COLLATERAL_AMOUNT.toString());
  });

  // ─── 10. Borrow (borrower) ─────────────────────────────────────────────────

  it("borrower borrows 5,000 USDC against SOL collateral", async () => {
    const borrowerLoanBalanceBefore = (await getAccount(connection, borrowerLoanAta)).amount;

    await program.methods
      .borrow(Array.from(marketId), new BN(BORROW_AMOUNT), new BN(0))
      .accounts({
        borrower: borrower.publicKey,
        market,
        irm: irmPda,
        position: borrowerPosition,
        loanVault,
        receiverLoanAta: borrowerLoanAta,
        collateralOracle,
        loanOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    const pos = await program.account.position.fetch(borrowerPosition);
    assert.isTrue(BigInt(pos.borrowShares.toString()) > 0n, "borrow shares > 0");

    const borrowerLoanBalance = (await getAccount(connection, borrowerLoanAta)).amount;
    assert.equal(
      borrowerLoanBalance - borrowerLoanBalanceBefore,
      BigInt(BORROW_AMOUNT),
      "borrower received correct USDC"
    );

    const mkt = await program.account.market.fetch(market);
    assert.equal(mkt.totalBorrowAssets.toString(), BORROW_AMOUNT.toString());
    console.log(`  Borrower borrow shares: ${pos.borrowShares.toString()}`);
    console.log(`  Market utilization: ${Number(mkt.totalBorrowAssets) / Number(mkt.totalSupplyAssets) * 100}%`);
  });

  // ─── 11. Health check — position is healthy ────────────────────────────────

  it("borrower position is healthy at $140 SOL", async () => {
    // collateral_value = 100 SOL * $140 = $14,000
    // debt_value = 5,000 USDC * $1 = $5,000
    // HF = $14,000 * 0.86 / $5,000 = 2.408 — healthy
    const pos = await program.account.position.fetch(borrowerPosition);
    const collateral = BigInt(pos.collateral.toString());
    const borrowShares = BigInt(pos.borrowShares.toString());
    const mkt = await program.account.market.fetch(market);

    const borrowAssets = (borrowShares * (BigInt(mkt.totalBorrowAssets.toString()) + 1n)) /
                         (BigInt(mkt.totalBorrowShares.toString()) + 1_000_000n);
    const collateralValue = collateral * SOL_PRICE_WAD / WAD;
    const loanValue = borrowAssets * USDC_PRICE_WAD / WAD;
    const hf = Number(collateralValue * LLTV) / Number(loanValue * BPS);

    console.log(`  Health factor: ${hf.toFixed(4)}`);
    assert.isTrue(hf > 1.0, "position should be healthy");
  });

  // ─── 12. Accrue interest ───────────────────────────────────────────────────

  it("accrues interest (permissionless crank)", async () => {
    const mktBefore = await program.account.market.fetch(market);

    await program.methods
      .accrueInterest(Array.from(marketId))
      .accounts({ market, irm: irmPda })
      .rpc();

    const mktAfter = await program.account.market.fetch(market);
    // Timestamps are the same if called in same slot — may be 0 interest
    console.log(`  Total borrow before: ${mktBefore.totalBorrowAssets}`);
    console.log(`  Total borrow after:  ${mktAfter.totalBorrowAssets}`);
  });

  // ─── 13. Repay ─────────────────────────────────────────────────────────────

  it("borrower repays full debt (shares-based)", async () => {
    const posBefore = await program.account.position.fetch(borrowerPosition);
    const borrowShares = posBefore.borrowShares;

    await program.methods
      .repay(Array.from(marketId), new BN(0), borrowShares)
      .accounts({
        repayer: borrower.publicKey,
        market,
        irm: irmPda,
        position: borrowerPosition,
        borrower: borrower.publicKey,
        repayerLoanAta: borrowerLoanAta,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    const posAfter = await program.account.position.fetch(borrowerPosition);
    assert.equal(posAfter.borrowShares.toString(), "0", "all debt cleared");
    console.log(`  Debt cleared. Paid back: ${BORROW_AMOUNT / 10 ** LOAN_DECIMALS} USDC (+ interest)`);
  });

  // ─── 14. Withdraw collateral ───────────────────────────────────────────────

  it("borrower withdraws all collateral after repayment", async () => {
    const balBefore = (await getAccount(connection, borrowerCollateralAta)).amount;

    await program.methods
      .withdrawCollateral(Array.from(marketId), new BN(COLLATERAL_AMOUNT))
      .accounts({
        owner: borrower.publicKey,
        market,
        irm: irmPda,
        position: borrowerPosition,
        collateralVault,
        receiverCollateralAta: borrowerCollateralAta,
        collateralOracle,
        loanOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    const balAfter = (await getAccount(connection, borrowerCollateralAta)).amount;
    assert.equal(balAfter - balBefore, BigInt(COLLATERAL_AMOUNT));

    const pos = await program.account.position.fetch(borrowerPosition);
    assert.equal(pos.collateral.toString(), "0");
  });

  // ─── 15. Withdraw loan tokens (lender) ─────────────────────────────────────

  it("lender withdraws supply (shares-based, gets principal + interest)", async () => {
    const lenderPos = await program.account.position.fetch(lenderPosition);
    const sharesBefore = lenderPos.supplyShares;
    const balBefore = (await getAccount(connection, lenderLoanAta)).amount;

    await program.methods
      .withdraw(Array.from(marketId), new BN(0), sharesBefore, new BN(0), new BN(0))
      .accounts({
        owner: lender.publicKey,
        market,
        irm: irmPda,
        position: lenderPosition,
        loanVault,
        receiverLoanAta: lenderLoanAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lender])
      .rpc();

    const posAfter = await program.account.position.fetch(lenderPosition);
    assert.equal(posAfter.supplyShares.toString(), "0");

    const balAfter = (await getAccount(connection, lenderLoanAta)).amount;
    const received = balAfter - balBefore;
    assert.isTrue(received >= BigInt(SUPPLY_AMOUNT), "lender gets back at least principal");
    console.log(`  Lender received: ${Number(received) / 10 ** LOAN_DECIMALS} USDC (principal + interest)`);
  });

  // ─── 16. Close empty position (reclaim rent) ───────────────────────────────

  it("lender closes empty position and reclaims rent", async () => {
    // Lender position should be empty after withdrawal
    const posBefore = await program.account.position.fetch(lenderPosition);
    assert.equal(posBefore.supplyShares.toString(), "0");
    assert.equal(posBefore.borrowShares.toString(), "0");
    assert.equal(posBefore.collateral.toString(), "0");

    const lenderBalBefore = await connection.getBalance(lender.publicKey);

    await program.methods
      .closePosition(Array.from(marketId))
      .accounts({
        owner: lender.publicKey,
        rentRecipient: lender.publicKey,
        position: lenderPosition,
      })
      .signers([lender])
      .rpc();

    // Position account should no longer exist
    const posAfter = await connection.getAccountInfo(lenderPosition);
    assert.isNull(posAfter, "position account should be closed");

    // Lender should have received rent back (~0.002 SOL)
    const lenderBalAfter = await connection.getBalance(lender.publicKey);
    const rentReceived = lenderBalAfter - lenderBalBefore;
    assert.isTrue(rentReceived > 0, "lender should receive rent back");
    console.log(`  Rent reclaimed: ${rentReceived / 1e9} SOL`);
  });

  it("rejects close_position on non-empty position", async () => {
    // Borrower still has collateral, so position is not empty
    const borrowerPos = await program.account.position.fetch(borrowerPosition);

    // If borrower already has 0 collateral (from previous test), supply some first
    if (BigInt(borrowerPos.collateral.toString()) === 0n) {
      // Mint and supply a small amount of collateral
      await mintTo(connection, payer, collateralMint, borrowerCollateralAta, payer, 1000);
      await program.methods
        .supplyCollateral(Array.from(marketId), new BN(1000))
        .accounts({
          depositor: borrower.publicKey,
          market,
          position: borrowerPosition,
          depositorCollateralAta: borrowerCollateralAta,
          collateralVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([borrower])
        .rpc();
    }

    try {
      await program.methods
        .closePosition(Array.from(marketId))
        .accounts({
          owner: borrower.publicKey,
          rentRecipient: borrower.publicKey,
          position: borrowerPosition,
        })
        .signers([borrower])
        .rpc();
      assert.fail("should have thrown PositionNotEmpty");
    } catch (e: any) {
      assert.include(e.logs?.join(" ") || e.message, "PositionNotEmpty");
    }
  });

  // ─── 17. Liquidation test ──────────────────────────────────────────────────

  describe("liquidation", () => {
    // Fresh positions for liquidation test
    let liqLenderAta: PublicKey;
    let liqBorrowerCollateralAta: PublicKey;
    let liqBorrowerLoanAta: PublicKey;
    const liqLender = Keypair.generate();
    const liqBorrower = Keypair.generate();

    let liqLenderPos: PublicKey;
    let liqBorrowerPos: PublicKey;

    before(async () => {
      // Fund accounts
      for (const kp of [liqLender, liqBorrower]) {
        const sig = await connection.requestAirdrop(kp.publicKey, 5 * 1e9);
        await connection.confirmTransaction(sig);
      }

      liqLenderAta = await createAccount(connection, payer, loanMint, liqLender.publicKey);
      liqBorrowerCollateralAta = await createAccount(connection, payer, collateralMint, liqBorrower.publicKey);
      liqBorrowerLoanAta = await createAccount(connection, payer, loanMint, liqBorrower.publicKey);

      await mintTo(connection, payer, loanMint, liqLenderAta, payer, SUPPLY_AMOUNT * 2);
      await mintTo(connection, payer, collateralMint, liqBorrowerCollateralAta, payer, COLLATERAL_AMOUNT);

      [liqLenderPos] = derivePosition(marketId, liqLender.publicKey, program.programId);
      [liqBorrowerPos] = derivePosition(marketId, liqBorrower.publicKey, program.programId);

      // Create positions
      for (const [owner, pos] of [[liqLender, liqLenderPos], [liqBorrower, liqBorrowerPos]] as [Keypair, PublicKey][]) {
        await program.methods
          .createPosition(Array.from(marketId))
          .accounts({
            payer: owner.publicKey, market, position: pos,
            owner: owner.publicKey, systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
      }

      // Lender supplies
      await program.methods
        .supply(Array.from(marketId), new BN(SUPPLY_AMOUNT), new BN(0))
        .accounts({
          supplier: liqLender.publicKey, market, irm: irmPda,
          position: liqLenderPos, supplierLoanAta: liqLenderAta,
          loanVault, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([liqLender])
        .rpc();

      // Borrower supplies collateral
      await program.methods
        .supplyCollateral(Array.from(marketId), new BN(COLLATERAL_AMOUNT))
        .accounts({
          depositor: liqBorrower.publicKey, market, position: liqBorrowerPos,
          depositorCollateralAta: liqBorrowerCollateralAta,
          collateralVault, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([liqBorrower])
        .rpc();

      // Borrower borrows at 86% LTV (barely healthy)
      const maxBorrow = Math.floor(COLLATERAL_AMOUNT * 140 / 1000 * 8600 / 10000); // ~$12,040
      const borrowSmall = Math.min(maxBorrow, SUPPLY_AMOUNT);
      await program.methods
        .borrow(Array.from(marketId), new BN(borrowSmall), new BN(0))
        .accounts({
          borrower: liqBorrower.publicKey, market, irm: irmPda,
          position: liqBorrowerPos, loanVault,
          receiverLoanAta: liqBorrowerLoanAta,
          collateralOracle, loanOracle, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([liqBorrower])
        .rpc();
    });

    it("crashes oracle price to make position liquidatable", async () => {
      // Drop SOL price from $140 to $50 — position becomes insolvent
      const crashedPriceWad = (50n * WAD) / 1_000_000_000n;

      await program.methods
        .setStaticOraclePrice(new BN(crashedPriceWad.toString()))
        .accounts({ admin: payer.publicKey, oracle: collateralOracle })
        .rpc();

      const oracle = await program.account.staticOracle.fetch(collateralOracle);
      assert.equal(oracle.priceWad.toString(), crashedPriceWad.toString());
      console.log(`  Oracle price crashed from $140 to $50`);
    });

    it("liquidator liquidates unhealthy position", async () => {
      const liqBorrowerPosBefore = await program.account.position.fetch(liqBorrowerPos);
      const seizeAmount = Math.floor(COLLATERAL_AMOUNT / 2); // seize 50 SOL

      const liqCollateralBalBefore = (await getAccount(connection, liquidatorCollateralAta)).amount;

      await program.methods
        .liquidate(Array.from(marketId), new BN(seizeAmount))
        .accounts({
          liquidator: liquidator.publicKey,
          market,
          irm: irmPda,
          borrowerPosition: liqBorrowerPos,
          borrower: liqBorrower.publicKey,
          liquidatorLoanAta,
          loanVault,
          collateralVault,
          liquidatorCollateralAta,
          collateralOracle,
          loanOracle,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([liquidator])
        .rpc();

      const liqBorrowerPosAfter = await program.account.position.fetch(liqBorrowerPos);
      assert.isTrue(
        BigInt(liqBorrowerPosAfter.collateral.toString()) < BigInt(liqBorrowerPosBefore.collateral.toString()),
        "collateral reduced"
      );
      assert.isTrue(
        BigInt(liqBorrowerPosAfter.borrowShares.toString()) < BigInt(liqBorrowerPosBefore.borrowShares.toString()),
        "debt reduced"
      );

      const liqCollateralBalAfter = (await getAccount(connection, liquidatorCollateralAta)).amount;
      assert.equal(liqCollateralBalAfter - liqCollateralBalBefore, BigInt(seizeAmount), "liquidator received collateral");
      console.log(`  Liquidator seized ${seizeAmount / 10 ** COLLATERAL_DECIMALS} SOL`);
      console.log(`  Borrower debt shares: ${liqBorrowerPosBefore.borrowShares} → ${liqBorrowerPosAfter.borrowShares}`);
    });

    after(async () => {
      // Restore oracle price for other tests
      await program.methods
        .setStaticOraclePrice(new BN(SOL_PRICE_WAD.toString()))
        .accounts({ admin: payer.publicKey, oracle: collateralOracle })
        .rpc();
    });
  });

  // ─── 17. Flash loan ────────────────────────────────────────────────────────

  it("flash loan: borrow and repay in same transaction", async () => {
    // Inject fresh liquidity — liquidation tests exhaust available supply
    const flashLiqLender = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(flashLiqLender.publicKey, 2 * 1e9);
    await connection.confirmTransaction(airdropSig);
    const flashLiqAta = await createAccount(connection, payer, loanMint, flashLiqLender.publicKey);
    await mintTo(connection, payer, loanMint, flashLiqAta, payer, SUPPLY_AMOUNT);
    const [flashLiqPos] = derivePosition(marketId, flashLiqLender.publicKey, program.programId);
    await program.methods
      .createPosition(Array.from(marketId))
      // @ts-ignore
      .accountsStrict({
        payer: flashLiqLender.publicKey,
        owner: flashLiqLender.publicKey,
        market,
        position: flashLiqPos,
        systemProgram: SystemProgram.programId,
      })
      .signers([flashLiqLender])
      .rpc();
    await program.methods
      .supply(Array.from(marketId), new BN(SUPPLY_AMOUNT), new BN(0))
      // @ts-ignore
      .accountsStrict({
        supplier: flashLiqLender.publicKey,
        protocolState,
        market,
        irm: irmPda,
        position: flashLiqPos,
        supplierLoanAta: flashLiqAta,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([flashLiqLender])
      .rpc();
    console.log(`  Injected ${SUPPLY_AMOUNT / 10 ** LOAN_DECIMALS} USDC fresh liquidity`);

    // Step 1: Check available liquidity in market
    const mktBefore = await program.account.market.fetch(market);
    const avail = BigInt(mktBefore.totalSupplyAssets.toString()) - BigInt(mktBefore.totalBorrowAssets.toString());
    console.log(`  Available liquidity: ${Number(avail) / 10 ** LOAN_DECIMALS} USDC`);

    const flashAmount = 1000 * 10 ** LOAN_DECIMALS; // 1,000 USDC
    assert.isTrue(avail >= BigInt(flashAmount), `need >= ${flashAmount} available liquidity, have ${avail}`);

    // Step 2: Create flash receiver token account
    const flashReceiverAta = await createAccount(connection, payer, loanMint, payer.publicKey);
    await mintTo(connection, payer, loanMint, flashReceiverAta, payer, flashAmount);
    console.log(`  Flash receiver created: ${flashReceiverAta.toBase58().slice(0,8)}`);

    // Step 3: Build instructions with no Anchor account resolution
    const startIx = await program.methods
      .flashLoanStart(Array.from(marketId), new BN(flashAmount))
      // @ts-ignore — accountsStrict = no auto-ATA creation
      .accountsStrict({
        caller: payer.publicKey,
        protocolState,
        market,
        loanVault,
        recipientLoanAta: flashReceiverAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const endIx = await program.methods
      .flashLoanEnd(Array.from(marketId), new BN(flashAmount))
      // @ts-ignore
      .accountsStrict({
        caller: payer.publicKey,
        market,
        loanVault,
        repayerLoanAta: flashReceiverAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    console.log(`  startIx prog: ${startIx.programId.toBase58().slice(0,8)}, keys: ${startIx.keys.length}`);
    console.log(`  endIx prog: ${endIx.programId.toBase58().slice(0,8)}, keys: ${endIx.keys.length}`);

    // Step 4: Send both in one atomic transaction
    await provider.sendAndConfirm(
      new Transaction().add(startIx).add(endIx),
      []
    );
    console.log(`  Flash loan of ${flashAmount / 10 ** LOAN_DECIMALS} USDC completed successfully`);

    // Verify market is unlocked after flash loan
    const mkt = await program.account.market.fetch(market);
    assert.equal(mkt.flashLoanLock, 0, "market unlocked after flash loan");
  });

  it("flash loan rejects mismatched repayment amount", async () => {
    const flashAmount = 500 * 10 ** LOAN_DECIMALS;
    const underpayAmount = 1 * 10 ** LOAN_DECIMALS;
    const flashCaller = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(flashCaller.publicKey, 1 * 1e9);
    await connection.confirmTransaction(airdropSig);
    const flashReceiverAta = await createAccount(
      connection,
      payer,
      loanMint,
      flashCaller.publicKey
    );
    await mintTo(connection, payer, loanMint, flashReceiverAta, payer, underpayAmount);

    const startIx = await program.methods
      .flashLoanStart(Array.from(marketId), new BN(flashAmount))
      // @ts-ignore
      .accountsStrict({
        caller: flashCaller.publicKey,
        protocolState,
        market,
        loanVault,
        recipientLoanAta: flashReceiverAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const endIx = await program.methods
      .flashLoanEnd(Array.from(marketId), new BN(underpayAmount))
      // @ts-ignore
      .accountsStrict({
        caller: flashCaller.publicKey,
        market,
        loanVault,
        repayerLoanAta: flashReceiverAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    let threw = false;
    try {
      await provider.sendAndConfirm(
        new Transaction().add(startIx).add(endIx),
        [flashCaller]
      );
    } catch {
      threw = true;
    }

    assert.isTrue(threw, "mismatched flash-loan repayment should fail");

    const mkt = await program.account.market.fetch(market);
    assert.equal(mkt.flashLoanLock, 0, "market remains unlocked after reverted tx");
    assert.equal(
      mkt.flashLoanAmount?.toString?.() ?? "0",
      "0",
      "flash-loan principal is cleared after reverted tx"
    );
  });
});
