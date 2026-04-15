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
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3";
import { assert } from "chai";
import { Nucleus } from "../target/types/nucleus";

// ─── Seeds & Helpers (same as other test files) ──────────────────────────────

const SEED_PREFIX = Buffer.from("nucleus");
const SEED_PROTOCOL = Buffer.from("protocol_state");
const SEED_MARKET = Buffer.from("market");
const SEED_POSITION = Buffer.from("position");
const SEED_COLLATERAL_VAULT = Buffer.from("collateral_vault");
const SEED_LOAN_VAULT = Buffer.from("loan_vault");
const SEED_LINEAR_IRM = Buffer.from("linear_irm");
const SEED_STATIC_ORACLE = Buffer.from("static_oracle");

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
  const data = Buffer.concat([
    collateralMint.toBuffer(),
    loanMint.toBuffer(),
    collateralOracleFeedId,
    loanOracleFeedId,
    irm.toBuffer(),
    lltvBuf,
  ]);
  return Buffer.from(keccak_256(data));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WAD = BigInt("1000000000000000000");
const LLTV = 8600n;
const FEE_BPS = 0n;
const IRM_NONCE = 200n; // Different nonce to avoid collision
const COLLATERAL_FEED_ID = Buffer.alloc(32, 0x22);
const LOAN_FEED_ID = Buffer.alloc(32, 0);
const COLLATERAL_DECIMALS = 9;
const LOAN_DECIMALS = 6;
const SOL_PRICE_WAD = (140n * WAD) / 1_000_000_000n;

// ─── Error Tests Suite ───────────────────────────────────────────────────────

describe("errors", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Nucleus as Program<Nucleus>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  let collateralMint: PublicKey;
  let loanMint: PublicKey;
  let protocolState: PublicKey;
  let irmPda: PublicKey;
  let marketId: Buffer;
  let market: PublicKey;
  let collateralVault: PublicKey;
  let loanVault: PublicKey;
  let collateralOracle: PublicKey;
  let loanOracle: PublicKey;

  const user = Keypair.generate();
  const borrower = Keypair.generate();
  let userPosition: PublicKey;
  let borrowerPosition: PublicKey;
  let userLoanAta: PublicKey;
  let borrowerLoanAta: PublicKey;
  let borrowerCollateralAta: PublicKey;

  before(async () => {
    // Fund test wallets
    for (const kp of [user, borrower]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * 1e9);
      await connection.confirmTransaction(sig);
    }

    // Create mints
    collateralMint = await createMint(connection, payer, payer.publicKey, null, COLLATERAL_DECIMALS);
    loanMint = await createMint(connection, payer, payer.publicKey, null, LOAN_DECIMALS);

    // Create accounts
    userLoanAta = await createAccount(connection, payer, loanMint, user.publicKey);
    borrowerLoanAta = await createAccount(connection, payer, loanMint, borrower.publicKey);
    borrowerCollateralAta = await createAccount(connection, payer, collateralMint, borrower.publicKey);

    await mintTo(connection, payer, loanMint, userLoanAta, payer, 100_000 * 10 ** LOAN_DECIMALS);
    await mintTo(connection, payer, collateralMint, borrowerCollateralAta, payer, 100 * 10 ** COLLATERAL_DECIMALS);

    // Derive PDAs
    [protocolState] = deriveProtocolState(program.programId);
    [irmPda] = deriveLinearIrm(payer.publicKey, IRM_NONCE, program.programId);
    [collateralOracle] = deriveStaticOracle(COLLATERAL_FEED_ID, program.programId);
    [loanOracle] = deriveStaticOracle(LOAN_FEED_ID, program.programId);

    // Initialize protocol if needed
    const protoInfo = await connection.getAccountInfo(protocolState);
    if (!protoInfo) {
      await program.methods
        .initializeProtocol(payer.publicKey, payer.publicKey)
        .accounts({
          payer: payer.publicKey,
          protocolState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Enable LLTV
    try {
      await program.methods
        .enableLltv(new BN(LLTV.toString()))
        .accounts({ owner: payer.publicKey, protocolState })
        .rpc();
    } catch (e: any) {
      if (!e.logs?.some((l: string) => l.includes("LltvAlreadyEnabled"))) throw e;
    }

    // Create IRM
    const irmInfo = await connection.getAccountInfo(irmPda);
    if (!irmInfo) {
      const SECONDS_PER_YEAR = 31_536_000n;
      await program.methods
        .createIrm(
          new BN(0),
          new BN(((5n * WAD / 100n) / SECONDS_PER_YEAR).toString()),
          new BN(((230n * WAD / 100n) / SECONDS_PER_YEAR).toString()),
          new BN((80n * WAD / 100n).toString()),
          new BN(IRM_NONCE.toString())
        )
        .accounts({
          payer: payer.publicKey,
          irm: irmPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Enable IRM
    try {
      await program.methods
        .enableIrm(irmPda)
        .accounts({ owner: payer.publicKey, protocolState })
        .rpc();
    } catch (e: any) {
      if (!e.logs?.some((l: string) => l.includes("IrmAlreadyEnabled"))) throw e;
    }

    // Create oracles
    const collOracleInfo = await connection.getAccountInfo(collateralOracle);
    if (!collOracleInfo) {
      await program.methods
        .createStaticOracle(Array.from(COLLATERAL_FEED_ID), new BN(SOL_PRICE_WAD.toString()))
        .accounts({
          payer: payer.publicKey,
          oracle: collateralOracle,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const loanOracleInfo = await connection.getAccountInfo(loanOracle);
    if (!loanOracleInfo) {
      await program.methods
        .createStaticOracle(Array.from(LOAN_FEED_ID), new BN((WAD / 1_000_000n).toString()))
        .accounts({
          payer: payer.publicKey,
          oracle: loanOracle,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Create market
    marketId = computeMarketId(collateralMint, loanMint, COLLATERAL_FEED_ID, LOAN_FEED_ID, irmPda, LLTV);
    [market] = deriveMarket(marketId, program.programId);
    [collateralVault] = deriveCollateralVault(marketId, program.programId);
    [loanVault] = deriveLoanVault(marketId, program.programId);
    [userPosition] = derivePosition(marketId, user.publicKey, program.programId);
    [borrowerPosition] = derivePosition(marketId, borrower.publicKey, program.programId);

    const marketInfo = await connection.getAccountInfo(market);
    if (!marketInfo) {
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
    }

    // Create positions
    for (const [owner, pos] of [[user, userPosition], [borrower, borrowerPosition]] as [Keypair, PublicKey][]) {
      const posInfo = await connection.getAccountInfo(pos);
      if (!posInfo) {
        await program.methods
          .createPosition(Array.from(marketId))
          .accounts({
            payer: owner.publicKey,
            owner: owner.publicKey,
            market,
            position: pos,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
      }
    }

    // User supplies liquidity
    await program.methods
      .supply(Array.from(marketId), new BN(50_000 * 10 ** LOAN_DECIMALS), new BN(0))
      .accounts({
        supplier: user.publicKey,
        protocolState,
        market,
        irm: irmPda,
        position: userPosition,
        supplierLoanAta: userLoanAta,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
  });

  // ─── ZeroAmount Tests ──────────────────────────────────────────────────────

  describe("ZeroAmount", () => {
    it("rejects supply with zero amount", async () => {
      try {
        await program.methods
          .supply(Array.from(marketId), new BN(0), new BN(0))
          .accounts({
            supplier: user.publicKey,
            protocolState,
            market,
            irm: irmPda,
            position: userPosition,
            supplierLoanAta: userLoanAta,
            loanVault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("should have thrown ZeroAmount");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "ZeroAmount");
      }
    });

    it("rejects borrow with zero amount", async () => {
      // First add collateral
      await program.methods
        .supplyCollateral(Array.from(marketId), new BN(10 * 10 ** COLLATERAL_DECIMALS))
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

      try {
        await program.methods
          .borrow(Array.from(marketId), new BN(0), new BN(0))
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
        assert.fail("should have thrown ZeroAmount");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "ZeroAmount");
      }
    });

    it("rejects supply_collateral with zero amount", async () => {
      try {
        await program.methods
          .supplyCollateral(Array.from(marketId), new BN(0))
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
        assert.fail("should have thrown ZeroAmount");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "ZeroAmount");
      }
    });
  });

  // ─── InvalidLltv Tests ─────────────────────────────────────────────────────

  describe("InvalidLltv", () => {
    it("rejects LLTV of 0", async () => {
      try {
        await program.methods
          .enableLltv(new BN(0))
          .accounts({ owner: payer.publicKey, protocolState })
          .rpc();
        assert.fail("should have thrown InvalidLltv");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "InvalidLltv");
      }
    });

    it("rejects LLTV >= 10000 (100%)", async () => {
      try {
        await program.methods
          .enableLltv(new BN(10000))
          .accounts({ owner: payer.publicKey, protocolState })
          .rpc();
        assert.fail("should have thrown InvalidLltv");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "InvalidLltv");
      }
    });
  });

  // ─── PositionUnhealthy Tests ───────────────────────────────────────────────

  describe("PositionUnhealthy", () => {
    it("rejects borrow that would make position unhealthy", async () => {
      // Borrower has 10 SOL collateral @ $140 = $1400
      // At 86% LLTV, max borrow = $1204
      // Try to borrow $1300 (should fail)
      try {
        await program.methods
          .borrow(Array.from(marketId), new BN(1300 * 10 ** LOAN_DECIMALS), new BN(0))
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
        assert.fail("should have thrown PositionUnhealthy");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "PositionUnhealthy");
      }
    });
  });

  // ─── InsufficientShares Tests ──────────────────────────────────────────────

  describe("InsufficientShares", () => {
    it("rejects withdraw of more shares than position has", async () => {
      const pos = await program.account.position.fetch(userPosition);
      const excessiveShares = pos.supplyShares.add(new BN(1));

      try {
        await program.methods
          .withdraw(Array.from(marketId), new BN(0), excessiveShares, new BN(0), new BN(0))
          .accounts({
            owner: user.publicKey,
            market,
            irm: irmPda,
            position: userPosition,
            loanVault,
            receiverLoanAta: userLoanAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        assert.fail("should have thrown InsufficientShares");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "InsufficientShares");
      }
    });
  });

  // ─── OraclePriceNonPositive Tests ──────────────────────────────────────────

  describe("OraclePriceNonPositive", () => {
    it("rejects oracle creation with zero price", async () => {
      const zeroFeedId = Buffer.alloc(32, 0x99);
      const [zeroOracle] = deriveStaticOracle(zeroFeedId, program.programId);

      try {
        await program.methods
          .createStaticOracle(Array.from(zeroFeedId), new BN(0))
          .accounts({
            payer: payer.publicKey,
            oracle: zeroOracle,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have thrown OraclePriceNonPositive");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "OraclePriceNonPositive");
      }
    });

    it("rejects setting oracle price to zero", async () => {
      try {
        await program.methods
          .setStaticOraclePrice(new BN(0))
          .accounts({
            admin: payer.publicKey,
            oracle: collateralOracle,
          })
          .rpc();
        assert.fail("should have thrown OraclePriceNonPositive");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "OraclePriceNonPositive");
      }
    });
  });

  // ─── LltvNotEnabled / IrmNotEnabled Tests ──────────────────────────────────

  describe("LltvNotEnabled / IrmNotEnabled", () => {
    it("rejects market creation with non-enabled LLTV", async () => {
      const nonEnabledLltv = 7777n;
      const badMarketId = computeMarketId(
        collateralMint, loanMint, COLLATERAL_FEED_ID, LOAN_FEED_ID, irmPda, nonEnabledLltv
      );
      const [badMarket] = deriveMarket(badMarketId, program.programId);
      const [badCollVault] = deriveCollateralVault(badMarketId, program.programId);
      const [badLoanVault] = deriveLoanVault(badMarketId, program.programId);

      try {
        await program.methods
          .createMarket(
            Array.from(badMarketId),
            Array.from(COLLATERAL_FEED_ID),
            Array.from(LOAN_FEED_ID),
            irmPda,
            new BN(nonEnabledLltv.toString()),
            new BN(0)
          )
          .accounts({
            payer: payer.publicKey,
            protocolState,
            collateralMint,
            loanMint,
            irmAccount: irmPda,
            market: badMarket,
            collateralVault: badCollVault,
            loanVault: badLoanVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have thrown LltvNotEnabled");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "LltvNotEnabled");
      }
    });
  });
});
