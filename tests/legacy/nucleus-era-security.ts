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
import { assert, expect } from "chai";
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
const IRM_NONCE = 100n; // Different from main tests to avoid collision
const COLLATERAL_FEED_ID = Buffer.alloc(32, 0x11); // Different from main tests
const LOAN_FEED_ID = Buffer.alloc(32, 0);
const COLLATERAL_DECIMALS = 9;
const LOAN_DECIMALS = 6;
const SOL_PRICE_WAD = (140n * WAD) / 1_000_000_000n;

// ─── Security Test Suite ─────────────────────────────────────────────────────

describe("security", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Paralend as Program<Paralend>;
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

  const attacker = Keypair.generate();
  const user = Keypair.generate();
  let userPosition: PublicKey;
  let userLoanAta: PublicKey;
  let userCollateralAta: PublicKey;

  // ─── Setup ─────────────────────────────────────────────────────────────────

  before(async () => {
    // Fund test wallets
    for (const kp of [attacker, user]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * 1e9);
      await connection.confirmTransaction(sig);
    }

    // Create mints
    collateralMint = await createMint(connection, payer, payer.publicKey, null, COLLATERAL_DECIMALS);
    loanMint = await createMint(connection, payer, payer.publicKey, null, LOAN_DECIMALS);

    // Create user accounts
    userLoanAta = await createAccount(connection, payer, loanMint, user.publicKey);
    userCollateralAta = await createAccount(connection, payer, collateralMint, user.publicKey);
    await mintTo(connection, payer, loanMint, userLoanAta, payer, 100_000 * 10 ** LOAN_DECIMALS);
    await mintTo(connection, payer, collateralMint, userCollateralAta, payer, 100 * 10 ** COLLATERAL_DECIMALS);

    // Derive PDAs
    [protocolState] = deriveProtocolState(program.programId);
    [irmPda] = deriveLinearIrm(payer.publicKey, IRM_NONCE, program.programId);
    [collateralOracle] = deriveStaticOracle(COLLATERAL_FEED_ID, program.programId);
    [loanOracle] = deriveStaticOracle(LOAN_FEED_ID, program.programId);

    // Check if protocol already initialized (from main test suite)
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

    // Enable LLTV if not already
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
          new BN(0), // base_rate
          new BN(((5n * WAD / 100n) / SECONDS_PER_YEAR).toString()), // slope1
          new BN(((230n * WAD / 100n) / SECONDS_PER_YEAR).toString()), // slope2
          new BN((80n * WAD / 100n).toString()), // kink
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

    // Compute market ID and derive market PDA
    marketId = computeMarketId(collateralMint, loanMint, COLLATERAL_FEED_ID, LOAN_FEED_ID, irmPda, LLTV);
    [market] = deriveMarket(marketId, program.programId);
    [collateralVault] = deriveCollateralVault(marketId, program.programId);
    [loanVault] = deriveLoanVault(marketId, program.programId);
    [userPosition] = derivePosition(marketId, user.publicKey, program.programId);

    // Create market if not exists
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

    // Create user position
    const posInfo = await connection.getAccountInfo(userPosition);
    if (!posInfo) {
      await program.methods
        .createPosition(Array.from(marketId))
        .accounts({
          payer: user.publicKey,
          owner: user.publicKey,
          market,
          position: userPosition,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
    }

    // User supplies some loan tokens
    await program.methods
      .supply(Array.from(marketId), new BN(10_000 * 10 ** LOAN_DECIMALS), new BN(0))
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

  // ─── Access Control Tests ──────────────────────────────────────────────────

  describe("access control", () => {
    it("rejects enable_lltv from non-owner", async () => {
      try {
        await program.methods
          .enableLltv(new BN(9000))
          .accounts({ owner: attacker.publicKey, protocolState })
          .signers([attacker])
          .rpc();
        assert.fail("should have thrown Unauthorized");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized", "expected Unauthorized error");
      }
    });

    it("rejects enable_irm from non-owner", async () => {
      const fakeIrm = Keypair.generate().publicKey;
      try {
        await program.methods
          .enableIrm(fakeIrm)
          .accounts({ owner: attacker.publicKey, protocolState })
          .signers([attacker])
          .rpc();
        assert.fail("should have thrown Unauthorized");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized", "expected Unauthorized error");
      }
    });

    it("rejects set_fee from non-owner", async () => {
      try {
        await program.methods
          .setFee(Array.from(marketId), new BN(500))
          .accounts({
            owner: attacker.publicKey,
            protocolState,
            market,
          })
          .signers([attacker])
          .rpc();
        assert.fail("should have thrown Unauthorized");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized", "expected Unauthorized error");
      }
    });

    it("rejects set_static_oracle_price from non-admin", async () => {
      try {
        await program.methods
          .setStaticOraclePrice(new BN((100n * WAD / 1_000_000_000n).toString()))
          .accounts({
            admin: attacker.publicKey,
            oracle: collateralOracle,
          })
          .signers([attacker])
          .rpc();
        assert.fail("should have thrown Unauthorized");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized", "expected Unauthorized error");
      }
    });
  });

  // ─── Oracle Staleness Tests ────────────────────────────────────────────────

  describe("oracle staleness", () => {
    // Note: Testing staleness requires manipulating time, which isn't easily done
    // in Solana tests. We test by checking that fresh prices work.

    it("accepts fresh oracle price for borrow", async () => {
      // Update oracle to ensure it's fresh
      await program.methods
        .setStaticOraclePrice(new BN(SOL_PRICE_WAD.toString()))
        .accounts({
          admin: payer.publicKey,
          oracle: collateralOracle,
        })
        .rpc();

      // Supply collateral first
      await program.methods
        .supplyCollateral(Array.from(marketId), new BN(10 * 10 ** COLLATERAL_DECIMALS))
        .accounts({
          depositor: user.publicKey,
          market,
          position: userPosition,
          depositorCollateralAta: userCollateralAta,
          collateralVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      // Borrow should succeed with fresh oracle
      await program.methods
        .borrow(Array.from(marketId), new BN(100 * 10 ** LOAN_DECIMALS), new BN(0))
        .accounts({
          borrower: user.publicKey,
          protocolState,
          market,
          irm: irmPda,
          position: userPosition,
          loanVault,
          receiverLoanAta: userLoanAta,
          collateralOracle,
          loanOracle,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      // Verify position has borrow
      const pos = await program.account.position.fetch(userPosition);
      assert.isTrue(pos.borrowShares.gt(new BN(0)), "position should have borrow shares");
    });
  });

  // ─── Duplicate Prevention Tests ────────────────────────────────────────────

  describe("duplicate prevention", () => {
    it("rejects duplicate LLTV enabling", async () => {
      try {
        await program.methods
          .enableLltv(new BN(LLTV.toString()))
          .accounts({ owner: payer.publicKey, protocolState })
          .rpc();
        assert.fail("should have thrown LltvAlreadyEnabled");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "LltvAlreadyEnabled");
      }
    });

    it("rejects duplicate IRM enabling", async () => {
      try {
        await program.methods
          .enableIrm(irmPda)
          .accounts({ owner: payer.publicKey, protocolState })
          .rpc();
        assert.fail("should have thrown IrmAlreadyEnabled");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "IrmAlreadyEnabled");
      }
    });
  });

  // ─── Fee Limits Tests ──────────────────────────────────────────────────────

  describe("fee limits", () => {
    it("rejects fee exceeding max (25%)", async () => {
      try {
        await program.methods
          .setFee(Array.from(marketId), new BN(2501)) // 25.01%
          .accounts({
            owner: payer.publicKey,
            protocolState,
            market,
          })
          .rpc();
        assert.fail("should have thrown FeeExceedsMax");
      } catch (e: any) {
        assert.include(e.logs?.join(" ") || e.message, "FeeExceedsMax");
      }
    });

    it("accepts fee at max (25%)", async () => {
      await program.methods
        .setFee(Array.from(marketId), new BN(2500)) // 25%
        .accounts({
          owner: payer.publicKey,
          protocolState,
          market,
        })
        .rpc();

      const mkt = await program.account.market.fetch(market);
      assert.equal(mkt.fee.toString(), "2500");

      // Reset to 0 for other tests
      await program.methods
        .setFee(Array.from(marketId), new BN(0))
        .accounts({
          owner: payer.publicKey,
          protocolState,
          market,
        })
        .rpc();
    });
  });
});
