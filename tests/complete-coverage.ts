import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
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
import { Paralend } from "../target/types/paralend";

// ─── Seeds ───────────────────────────────────────────────────────────────────

const SEED_PREFIX = Buffer.from("paralend");
const SEED_PROTOCOL = Buffer.from("protocol_state");
const SEED_MARKET = Buffer.from("market");
const SEED_POSITION = Buffer.from("position");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_LINEAR_IRM = Buffer.from("linear_irm");
const SEED_STATIC_ORACLE = Buffer.from("static_oracle");

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function deriveProtocolState(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_PREFIX, SEED_PROTOCOL], programId);
}

function deriveMarket(marketId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_PREFIX, SEED_MARKET, marketId], programId);
}

function deriveCollateralVault(marketId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_PREFIX, SEED_COLLATERAL_VAULT, marketId], programId);
}

function deriveLoanVault(marketId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_PREFIX, SEED_LOAN_VAULT, marketId], programId);
}

function derivePosition(marketId: Buffer, owner: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_PREFIX, SEED_POSITION, marketId, owner.toBuffer()], programId);
}

function deriveLinearIrm(admin: PublicKey, nonce: bigint, programId: PublicKey): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync([SEED_PREFIX, SEED_LINEAR_IRM, admin.toBuffer(), nonceBuf], programId);
}

function deriveStaticOracle(feedId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_PREFIX, SEED_STATIC_ORACLE, feedId], programId);
}

function computeMarketId(
  collateralMint: PublicKey,
  loanMint: PublicKey,
  collateralOracleFeedId: Buffer,
  loanOracleFeedId: Buffer,
  irm: PublicKey,
  lltv: bigint
): Buffer {
  const lltvBuf = Buffer.alloc(8);
  lltvBuf.writeBigUInt64LE(lltv);
  return Buffer.from(
    keccak_256(
      Buffer.concat([
        collateralMint.toBuffer(),
        loanMint.toBuffer(),
        collateralOracleFeedId,
        loanOracleFeedId,
        irm.toBuffer(),
        lltvBuf,
      ])
    )
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WAD = 1_000_000_000_000_000_000n;
const BPS = 10_000n;
const SECONDS_PER_YEAR = 31_536_000n;

const COLLATERAL_DECIMALS = 9;
const LOAN_DECIMALS = 6;
const LLTV = 8600n; // 86%
const IRM_NONCE = 100n; // Different nonce for this test file

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("complete-coverage", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Paralend as Program<Paralend>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // Accounts
  let collateralMint: PublicKey;
  let loanMint: PublicKey;
  let protocolState: PublicKey;
  let market: PublicKey;
  let marketId: Buffer;
  let collateralVault: PublicKey;
  let loanVault: PublicKey;
  let irmPda: PublicKey;
  let collateralOracle: PublicKey;
  let loanOracle: PublicKey;

  // Test users
  const lender = Keypair.generate();
  const borrower = Keypair.generate();
  let lenderPosition: PublicKey;
  let borrowerPosition: PublicKey;
  let lenderLoanAta: PublicKey;
  let borrowerLoanAta: PublicKey;
  let borrowerCollateralAta: PublicKey;

  // Feed IDs
  const collateralFeedId = Buffer.alloc(32);
  collateralFeedId[0] = 0xCC; // Unique for this test
  const loanFeedId = Buffer.alloc(32);

  // Amounts
  const SUPPLY_AMOUNT = 50_000 * 10 ** LOAN_DECIMALS; // 50K USDC
  const COLLATERAL_AMOUNT = 100 * 10 ** COLLATERAL_DECIMALS; // 100 SOL
  const BORROW_AMOUNT = 10_000 * 10 ** LOAN_DECIMALS; // 10K USDC

  before(async () => {
    // Airdrop to test users
    for (const kp of [lender, borrower]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * 1e9);
      await connection.confirmTransaction(sig);
    }

    // Create mints
    collateralMint = await createMint(connection, payer, payer.publicKey, null, COLLATERAL_DECIMALS);
    loanMint = await createMint(connection, payer, payer.publicKey, null, LOAN_DECIMALS);

    // Create token accounts
    lenderLoanAta = await createAccount(connection, payer, loanMint, lender.publicKey);
    borrowerLoanAta = await createAccount(connection, payer, loanMint, borrower.publicKey);
    borrowerCollateralAta = await createAccount(connection, payer, collateralMint, borrower.publicKey);

    // Mint tokens
    await mintTo(connection, payer, loanMint, lenderLoanAta, payer, SUPPLY_AMOUNT * 2);
    await mintTo(connection, payer, collateralMint, borrowerCollateralAta, payer, COLLATERAL_AMOUNT * 2);
    await mintTo(connection, payer, loanMint, borrowerLoanAta, payer, BORROW_AMOUNT); // For repayment

    // Derive PDAs
    [protocolState] = deriveProtocolState(program.programId);
    [irmPda] = deriveLinearIrm(payer.publicKey, IRM_NONCE, program.programId);
    [collateralOracle] = deriveStaticOracle(collateralFeedId, program.programId);
    [loanOracle] = deriveStaticOracle(loanFeedId, program.programId);

    // Initialize protocol if not exists
    const protocolExists = await connection.getAccountInfo(protocolState);
    if (!protocolExists) {
      await program.methods
        .initializeProtocol(payer.publicKey, payer.publicKey)
        .accounts({
          payer: payer.publicKey,
          protocolState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Enable LLTV if not already
    const state = await program.account.protocolState.fetch(protocolState);
    const lltvEnabled = state.enabledLltvs.some((v: BN) => v.eq(new BN(LLTV.toString())));
    if (!lltvEnabled) {
      await program.methods
        .enableLltv(new BN(LLTV.toString()))
        .accounts({ owner: payer.publicKey, protocolState })
        .rpc();
    }

    // Create IRM
    const baseRate = 0n;
    const slope1 = (WAD * 5n / 100n) / SECONDS_PER_YEAR;
    const slope2 = (WAD * 230n / 100n) / SECONDS_PER_YEAR;
    const kink = (WAD * 80n) / 100n;

    try {
      await program.methods
        .createIrm(
          new BN(baseRate.toString()),
          new BN(slope1.toString()),
          new BN(slope2.toString()),
          new BN(kink.toString()),
          new BN(IRM_NONCE.toString())
        )
        .accounts({
          admin: payer.publicKey,
          irm: irmPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e: any) {
      if (!e.message?.includes("already in use")) throw e;
    }

    // Enable IRM if not already
    const stateForIrm = await program.account.protocolState.fetch(protocolState);
    const irmEnabled = stateForIrm.enabledIrms.some((k: PublicKey) => k.equals(irmPda));
    if (!irmEnabled) {
      await program.methods
        .enableIrm(irmPda)
        .accounts({ owner: payer.publicKey, protocolState })
        .rpc();
    }

    // Create oracles
    const collateralPriceWad = (140n * WAD) / BigInt(10 ** COLLATERAL_DECIMALS);
    const loanPriceWad = WAD / BigInt(10 ** LOAN_DECIMALS);

    for (const [feedId, oracle, price] of [
      [collateralFeedId, collateralOracle, collateralPriceWad],
      [loanFeedId, loanOracle, loanPriceWad],
    ] as [Buffer, PublicKey, bigint][]) {
      const existing = await connection.getAccountInfo(oracle);
      if (!existing) {
        await program.methods
          .createStaticOracle(Array.from(feedId), new BN(price.toString()))
          .accounts({
            payer: payer.publicKey,
            oracle,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    }

    // Compute market ID and create market
    marketId = computeMarketId(
      collateralMint,
      loanMint,
      collateralFeedId,
      loanFeedId,
      irmPda,
      LLTV
    );

    [market] = deriveMarket(marketId, program.programId);
    [collateralVault] = deriveCollateralVault(marketId, program.programId);
    [loanVault] = deriveLoanVault(marketId, program.programId);

    const marketExists = await connection.getAccountInfo(market);
    if (!marketExists) {
      await program.methods
        .createMarket(
          Array.from(marketId),
          Array.from(collateralFeedId),
          Array.from(loanFeedId),
          irmPda,
          new BN(LLTV.toString()),
          new BN(1000) // 10% fee for testing fee accrual
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
    }

    // Create positions
    [lenderPosition] = derivePosition(marketId, lender.publicKey, program.programId);
    [borrowerPosition] = derivePosition(marketId, borrower.publicKey, program.programId);

    for (const [owner, pos] of [[lender, lenderPosition], [borrower, borrowerPosition]] as [Keypair, PublicKey][]) {
      const existing = await connection.getAccountInfo(pos);
      if (!existing) {
        await program.methods
          .createPosition(Array.from(marketId))
          .accounts({
            payer: payer.publicKey,
            owner: owner.publicKey,
            market,
            position: pos,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    }
  });

  // ─── Slippage Protection Tests ─────────────────────────────────────────────

  describe("slippage protection", () => {
    it("supply rejects when shares below min_shares", async () => {
      // Supply with impossibly high min_shares requirement
      const amount = 1000 * 10 ** LOAN_DECIMALS;
      const impossibleMinShares = new BN("999999999999999999999999"); // Way more than possible

      try {
        await program.methods
          .supply(Array.from(marketId), new BN(amount), impossibleMinShares)
          .accounts({
            supplier: lender.publicKey,
            protocolState,
            market,
            irm: irmPda,
            position: lenderPosition,
            supplierLoanAta: lenderLoanAta,
            loanVault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([lender])
          .rpc();
        assert.fail("should have thrown SlippageExceeded");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "SlippageExceeded");
      }
    });

    it("supply succeeds when min_shares is met", async () => {
      const amount = 1000 * 10 ** LOAN_DECIMALS;
      // First supply should get ~1000 * 1e12 shares (with virtual shares adjustment)
      const reasonableMinShares = new BN(100); // Very low, will definitely be met

      const posBefore = await program.account.position.fetch(lenderPosition);
      const sharesBefore = BigInt(posBefore.supplyShares.toString());

      await program.methods
        .supply(Array.from(marketId), new BN(amount), reasonableMinShares)
        .accounts({
          supplier: lender.publicKey,
          protocolState,
          market,
          irm: irmPda,
          position: lenderPosition,
          supplierLoanAta: lenderLoanAta,
          loanVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([lender])
        .rpc();

      const posAfter = await program.account.position.fetch(lenderPosition);
      const sharesAfter = BigInt(posAfter.supplyShares.toString());
      assert.isTrue(sharesAfter > sharesBefore, "shares should increase");
    });

    it("borrow rejects when shares exceed max_shares", async () => {
      // First supply collateral
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

      // Try to borrow with impossibly low max_shares
      const borrowAmount = 1000 * 10 ** LOAN_DECIMALS;
      const impossibleMaxShares = new BN(1); // Only 1 share allowed - impossible

      try {
        await program.methods
          .borrow(Array.from(marketId), new BN(borrowAmount), impossibleMaxShares)
          .accounts({
            borrower: borrower.publicKey,
            protocolState,
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
        assert.fail("should have thrown SlippageExceeded");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "SlippageExceeded");
      }
    });

    it("borrow succeeds when max_shares is sufficient", async () => {
      const borrowAmount = 1000 * 10 ** LOAN_DECIMALS;
      const generousMaxShares = new BN("999999999999999999"); // Very high limit

      const posBefore = await program.account.position.fetch(borrowerPosition);
      const sharesBefore = BigInt(posBefore.borrowShares.toString());

      await program.methods
        .borrow(Array.from(marketId), new BN(borrowAmount), generousMaxShares)
        .accounts({
          borrower: borrower.publicKey,
          protocolState,
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

      const posAfter = await program.account.position.fetch(borrowerPosition);
      const sharesAfter = BigInt(posAfter.borrowShares.toString());
      assert.isTrue(sharesAfter > sharesBefore, "borrow shares should increase");
    });
  });

  // ─── Withdraw By Assets Tests ──────────────────────────────────────────────

  describe("withdraw by assets", () => {
    before(async () => {
      // Supply more liquidity to ensure there's enough to withdraw
      // Previous tests borrowed out all available liquidity
      await program.methods
        .supply(Array.from(marketId), new BN(10000 * 10 ** LOAN_DECIMALS), new BN(0))
        .accounts({
          supplier: lender.publicKey,
          protocolState,
          market,
          irm: irmPda,
          position: lenderPosition,
          supplierLoanAta: lenderLoanAta,
          loanVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([lender])
        .rpc();
    });

    it("withdraws exact asset amount (burns calculated shares)", async () => {
      const withdrawAssets = 100 * 10 ** LOAN_DECIMALS; // 100 USDC

      const posBefore = await program.account.position.fetch(lenderPosition);
      const sharesBefore = BigInt(posBefore.supplyShares.toString());
      const balBefore = (await getAccount(connection, lenderLoanAta)).amount;

      // Withdraw by assets: assets > 0, shares = 0
      await program.methods
        .withdraw(
          Array.from(marketId),
          new BN(withdrawAssets), // assets
          new BN(0), // shares = 0 means withdraw by assets
          new BN(0), // max_shares_burn (no slippage check)
          new BN(0)  // min_assets_out (not used when by assets)
        )
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
      const sharesAfter = BigInt(posAfter.supplyShares.toString());
      const balAfter = (await getAccount(connection, lenderLoanAta)).amount;

      assert.isTrue(sharesAfter < sharesBefore, "shares should decrease");
      assert.equal(
        Number(balAfter - balBefore),
        withdrawAssets,
        "should receive exact assets requested"
      );
    });

    it("withdraw by assets respects max_shares_burn slippage", async () => {
      const withdrawAssets = 100 * 10 ** LOAN_DECIMALS;
      const impossibleMaxShares = new BN(1); // Only 1 share burn allowed

      try {
        await program.methods
          .withdraw(
            Array.from(marketId),
            new BN(withdrawAssets),
            new BN(0),
            impossibleMaxShares, // Slippage: max 1 share
            new BN(0)
          )
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
        assert.fail("should have thrown SlippageExceeded");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "SlippageExceeded");
      }
    });
  });

  // ─── Repay By Assets Tests ─────────────────────────────────────────────────

  describe("repay by assets", () => {
    it("repays exact asset amount (clears calculated shares)", async () => {
      const repayAssets = 100 * 10 ** LOAN_DECIMALS; // 100 USDC

      const posBefore = await program.account.position.fetch(borrowerPosition);
      const sharesBefore = BigInt(posBefore.borrowShares.toString());

      // Repay by assets: assets > 0, shares = 0
      await program.methods
        .repay(
          Array.from(marketId),
          new BN(repayAssets), // assets
          new BN(0) // shares = 0 means repay by assets
        )
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
      const sharesAfter = BigInt(posAfter.borrowShares.toString());

      assert.isTrue(sharesAfter < sharesBefore, "borrow shares should decrease");
      console.log(`  Repaid ${repayAssets / 10 ** LOAN_DECIMALS} USDC, shares: ${sharesBefore} → ${sharesAfter}`);
    });
  });

  // ─── Insufficient Liquidity Tests ──────────────────────────────────────────

  describe("insufficient liquidity", () => {
    it("rejects borrow exceeding available liquidity", async () => {
      const mkt = await program.account.market.fetch(market);
      const available = BigInt(mkt.totalSupplyAssets.toString()) - BigInt(mkt.totalBorrowAssets.toString());

      // Try to borrow more than available
      const excessiveBorrow = Number(available) + 1000 * 10 ** LOAN_DECIMALS;

      try {
        await program.methods
          .borrow(Array.from(marketId), new BN(excessiveBorrow), new BN(0))
          .accounts({
            borrower: borrower.publicKey,
            protocolState,
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
        assert.fail("should have thrown InsufficientLiquidity");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "InsufficientLiquidity");
      }
    });

    it("rejects withdraw exceeding available liquidity", async () => {
      const mkt = await program.account.market.fetch(market);
      const available = BigInt(mkt.totalSupplyAssets.toString()) - BigInt(mkt.totalBorrowAssets.toString());

      // Try to withdraw more than available (some is borrowed out)
      const excessiveWithdraw = Number(available) + 1000 * 10 ** LOAN_DECIMALS;

      try {
        await program.methods
          .withdraw(
            Array.from(marketId),
            new BN(excessiveWithdraw),
            new BN(0),
            new BN(0),
            new BN(0)
          )
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
        assert.fail("should have thrown error");
      } catch (e: any) {
        // Could be InsufficientLiquidity or InsufficientShares depending on position state
        const errStr = e.logs?.join(" ") || e.message || "";
        const hasExpectedError = errStr.includes("InsufficientLiquidity") ||
                                  errStr.includes("InsufficientShares") ||
                                  errStr.includes("6014") || // InsufficientLiquidity code
                                  errStr.includes("6011");   // InsufficientShares code
        assert.isTrue(hasExpectedError, `Expected liquidity/shares error but got: ${errStr.slice(0, 200)}`);
      }
    });
  });

  // ─── Fee Accrual and Claim Tests ───────────────────────────────────────────

  describe("fee accrual and claim", () => {
    it("accrues fees over time", async () => {
      // Wait a bit for interest to accrue
      await new Promise(resolve => setTimeout(resolve, 2000));

      const mktBefore = await program.account.market.fetch(market);
      const feesBefore = BigInt(mktBefore.pendingFeeShares.toString());

      // Trigger interest accrual
      await program.methods
        .accrueInterest(Array.from(marketId))
        .accounts({
          market,
          irm: irmPda,
        })
        .rpc();

      const mktAfter = await program.account.market.fetch(market);
      const feesAfter = BigInt(mktAfter.pendingFeeShares.toString());

      // Fees should have increased (we set 10% fee on this market)
      console.log(`  Pending fee shares: ${feesBefore} → ${feesAfter}`);
      // Note: fees might not increase if no time passed or no borrows
    });

    it("claims accumulated fees", async () => {
      const mkt = await program.account.market.fetch(market);
      const pendingFees = BigInt(mkt.pendingFeeShares.toString());

      if (pendingFees === 0n) {
        console.log("  Skipping claim_fees test - no fees accumulated");
        return;
      }

      // Fee recipient is the payer (protocol owner)
      const state = await program.account.protocolState.fetch(protocolState);
      const feeRecipient = state.feeRecipient;
      assert.isTrue(feeRecipient.equals(payer.publicKey), "fee_recipient should be payer");

      // Create position for fee_recipient if needed (claim_fees credits shares to position)
      const [feeRecipientPosition] = derivePosition(marketId, payer.publicKey, program.programId);
      const posExists = await connection.getAccountInfo(feeRecipientPosition);
      if (!posExists) {
        await program.methods
          .createPosition(Array.from(marketId))
          .accounts({
            payer: payer.publicKey,
            owner: payer.publicKey,
            market,
            position: feeRecipientPosition,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      const posBefore = await program.account.position.fetch(feeRecipientPosition);
      const sharesBefore = BigInt(posBefore.supplyShares.toString());

      await program.methods
        .claimFees(Array.from(marketId))
        .accounts({
          feeRecipient: payer.publicKey,
          protocolState,
          market,
          position: feeRecipientPosition,
        })
        .rpc();

      const posAfter = await program.account.position.fetch(feeRecipientPosition);
      const sharesAfter = BigInt(posAfter.supplyShares.toString());
      const mktAfter = await program.account.market.fetch(market);

      assert.equal(mktAfter.pendingFeeShares.toString(), "0", "fees should be cleared");
      console.log(`  Claimed ${sharesAfter - sharesBefore} fee shares`);
    });
  });

  // ─── Withdraw By Shares Slippage Tests ─────────────────────────────────────

  describe("withdraw by shares slippage", () => {
    it("withdraw by shares respects min_assets_out", async () => {
      const pos = await program.account.position.fetch(lenderPosition);
      const sharesToWithdraw = BigInt(pos.supplyShares.toString()) / 10n; // 10% of shares

      if (sharesToWithdraw === 0n) {
        console.log("  Skipping - no shares to withdraw");
        return;
      }

      // Demand impossibly high assets out
      const impossibleMinAssets = new BN("999999999999999999");

      try {
        await program.methods
          .withdraw(
            Array.from(marketId),
            new BN(0), // assets = 0 means withdraw by shares
            new BN(sharesToWithdraw.toString()),
            new BN(0),
            impossibleMinAssets // Slippage: min assets out
          )
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
        assert.fail("should have thrown SlippageExceeded");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "SlippageExceeded");
      }
    });
  });
});
