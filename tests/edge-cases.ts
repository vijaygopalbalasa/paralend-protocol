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
import { Nucleus } from "../target/types/nucleus";

// ─── Seeds & Helpers ─────────────────────────────────────────────────────────

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
const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1n;
const LLTV = 8600n;
const FEE_BPS = 0n;
const IRM_NONCE = 300n;
const COLLATERAL_FEED_ID = Buffer.alloc(32, 0x33);
const LOAN_FEED_ID = Buffer.alloc(32, 0);
const COLLATERAL_DECIMALS = 9;
const LOAN_DECIMALS = 6;
const SOL_PRICE_WAD = (140n * WAD) / 1_000_000_000n;

// ─── Edge Cases Test Suite ───────────────────────────────────────────────────

describe("edge-cases", () => {
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

  const firstDepositor = Keypair.generate();
  const secondDepositor = Keypair.generate();
  const attacker = Keypair.generate();
  let firstDepositorPosition: PublicKey;
  let secondDepositorPosition: PublicKey;
  let attackerPosition: PublicKey;
  let firstDepositorLoanAta: PublicKey;
  let secondDepositorLoanAta: PublicKey;
  let attackerLoanAta: PublicKey;

  before(async () => {
    // Fund test wallets
    for (const kp of [firstDepositor, secondDepositor, attacker]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * 1e9);
      await connection.confirmTransaction(sig);
    }

    // Create mints
    collateralMint = await createMint(connection, payer, payer.publicKey, null, COLLATERAL_DECIMALS);
    loanMint = await createMint(connection, payer, payer.publicKey, null, LOAN_DECIMALS);

    // Create accounts
    firstDepositorLoanAta = await createAccount(connection, payer, loanMint, firstDepositor.publicKey);
    secondDepositorLoanAta = await createAccount(connection, payer, loanMint, secondDepositor.publicKey);
    attackerLoanAta = await createAccount(connection, payer, loanMint, attacker.publicKey);

    // Mint tokens
    await mintTo(connection, payer, loanMint, firstDepositorLoanAta, payer, 100 * 10 ** LOAN_DECIMALS);
    await mintTo(connection, payer, loanMint, secondDepositorLoanAta, payer, 1_000_000 * 10 ** LOAN_DECIMALS);
    await mintTo(connection, payer, loanMint, attackerLoanAta, payer, 1_000_000 * 10 ** LOAN_DECIMALS);

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
    [firstDepositorPosition] = derivePosition(marketId, firstDepositor.publicKey, program.programId);
    [secondDepositorPosition] = derivePosition(marketId, secondDepositor.publicKey, program.programId);
    [attackerPosition] = derivePosition(marketId, attacker.publicKey, program.programId);

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
    for (const [owner, pos] of [
      [firstDepositor, firstDepositorPosition],
      [secondDepositor, secondDepositorPosition],
      [attacker, attackerPosition],
    ] as [Keypair, PublicKey][]) {
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
  });

  // ─── First Depositor Attack Protection ─────────────────────────────────────

  describe("first depositor attack protection", () => {
    it("uses virtual shares to prevent inflation attack", async () => {
      // Classic inflation attack:
      // 1. Attacker deposits 1 wei, gets ~1 share
      // 2. Attacker donates 1M tokens to vault directly
      // 3. Next depositor deposits 500K, but gets 0 shares due to rounding
      //
      // With virtual shares (VIRTUAL_SHARES=1M, VIRTUAL_ASSETS=1):
      // - First deposit of 1 wei gets: 1 * (0 + 1M) / (0 + 1) = 1M shares
      // - This makes the attack economically infeasible

      // First depositor supplies a small amount (simulating attacker's first step)
      const smallAmount = 1; // 1 micro-USDC
      await program.methods
        .supply(Array.from(marketId), new BN(smallAmount), new BN(0))
        .accounts({
          supplier: firstDepositor.publicKey,
          protocolState,
          market,
          irm: irmPda,
          position: firstDepositorPosition,
          supplierLoanAta: firstDepositorLoanAta,
          loanVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([firstDepositor])
        .rpc();

      const firstPos = await program.account.position.fetch(firstDepositorPosition);
      const firstShares = BigInt(firstPos.supplyShares.toString());

      // With virtual shares, 1 wei deposit should get ~1M shares (VIRTUAL_SHARES)
      // Formula: shares = assets * (totalShares + VIRTUAL_SHARES) / (totalAssets + VIRTUAL_ASSETS)
      //        = 1 * (0 + 1_000_000) / (0 + 1) = 1_000_000
      assert.isTrue(firstShares >= 900_000n, `first depositor should get ~1M shares, got ${firstShares}`);

      // Second depositor supplies a larger amount
      const largeAmount = 100_000 * 10 ** LOAN_DECIMALS; // 100K USDC
      await program.methods
        .supply(Array.from(marketId), new BN(largeAmount), new BN(0))
        .accounts({
          supplier: secondDepositor.publicKey,
          protocolState,
          market,
          irm: irmPda,
          position: secondDepositorPosition,
          supplierLoanAta: secondDepositorLoanAta,
          loanVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([secondDepositor])
        .rpc();

      const secondPos = await program.account.position.fetch(secondDepositorPosition);
      const secondShares = BigInt(secondPos.supplyShares.toString());

      // Second depositor should get a proportional amount of shares
      // They deposited 100M times more, so should get roughly proportional shares
      assert.isTrue(secondShares > firstShares * 1000n, "second depositor should get many more shares");
      console.log(`  First depositor (1 wei): ${firstShares} shares`);
      console.log(`  Second depositor (100K): ${secondShares} shares`);
    });

    it("second depositor gets fair share ratio", async () => {
      // Verify the share-to-asset ratio is roughly maintained
      const mkt = await program.account.market.fetch(market);
      const totalAssets = BigInt(mkt.totalSupplyAssets.toString());
      const totalShares = BigInt(mkt.totalSupplyShares.toString());

      const secondPos = await program.account.position.fetch(secondDepositorPosition);
      const secondShares = BigInt(secondPos.supplyShares.toString());

      // Second depositor's shares should represent close to their deposit proportion
      // of total assets (minus the small first deposit)
      const secondDeposit = 100_000n * BigInt(10 ** LOAN_DECIMALS);
      const expectedShareRatio = secondDeposit * 10000n / totalAssets;
      const actualShareRatio = secondShares * 10000n / totalShares;

      // Should be within 1% (accounting for virtual shares adjustment)
      const ratioDiff = expectedShareRatio > actualShareRatio
        ? expectedShareRatio - actualShareRatio
        : actualShareRatio - expectedShareRatio;
      assert.isTrue(ratioDiff < 200n, `share ratio should be close to deposit ratio, diff: ${ratioDiff} bps`);
    });
  });

  // ─── Rounding Direction Tests ──────────────────────────────────────────────

  describe("rounding direction", () => {
    it("supply rounds DOWN shares (protocol favored)", async () => {
      // For supply: fewer shares = worse for user = correct
      const mktBefore = await program.account.market.fetch(market);
      const supplyAmount = 7; // Odd number to test rounding

      await program.methods
        .supply(Array.from(marketId), new BN(supplyAmount), new BN(0))
        .accounts({
          supplier: attacker.publicKey,
          protocolState,
          market,
          irm: irmPda,
          position: attackerPosition,
          supplierLoanAta: attackerLoanAta,
          loanVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();

      const attackerPos = await program.account.position.fetch(attackerPosition);
      const shares = BigInt(attackerPos.supplyShares.toString());

      // Verify share calculation rounds down
      // shares = assets * (totalShares + VIRTUAL) / (totalAssets + VIRTUAL)
      const totalSharesBefore = BigInt(mktBefore.totalSupplyShares.toString());
      const totalAssetsBefore = BigInt(mktBefore.totalSupplyAssets.toString());

      const exactShares = BigInt(supplyAmount) * (totalSharesBefore + VIRTUAL_SHARES) / (totalAssetsBefore + VIRTUAL_ASSETS);
      assert.isTrue(shares <= exactShares, "shares should round DOWN for supply");
    });
  });

  // ─── Small Amount Handling ─────────────────────────────────────────────────

  describe("small amount handling", () => {
    it("handles minimum viable supply (1 micro-unit)", async () => {
      const smallSupplier = Keypair.generate();
      const sig = await connection.requestAirdrop(smallSupplier.publicKey, 2 * 1e9);
      await connection.confirmTransaction(sig);

      const smallSupplierAta = await createAccount(connection, payer, loanMint, smallSupplier.publicKey);
      await mintTo(connection, payer, loanMint, smallSupplierAta, payer, 1000);

      const [smallPosition] = derivePosition(marketId, smallSupplier.publicKey, program.programId);
      await program.methods
        .createPosition(Array.from(marketId))
        .accounts({
          payer: smallSupplier.publicKey,
          owner: smallSupplier.publicKey,
          market,
          position: smallPosition,
          systemProgram: SystemProgram.programId,
        })
        .signers([smallSupplier])
        .rpc();

      // Supply 1 micro-unit
      await program.methods
        .supply(Array.from(marketId), new BN(1), new BN(0))
        .accounts({
          supplier: smallSupplier.publicKey,
          protocolState,
          market,
          irm: irmPda,
          position: smallPosition,
          supplierLoanAta: smallSupplierAta,
          loanVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([smallSupplier])
        .rpc();

      const pos = await program.account.position.fetch(smallPosition);
      assert.isTrue(pos.supplyShares.gt(new BN(0)), "should have received some shares for 1 micro-unit");
    });
  });

  // ─── Market State Consistency ──────────────────────────────────────────────

  describe("market state consistency", () => {
    it("total_supply_assets matches vault balance", async () => {
      const mkt = await program.account.market.fetch(market);
      const vaultBalance = (await getAccount(connection, loanVault)).amount;

      // Note: With borrows, vault balance = supply - borrow
      // Without borrows, they should match
      const totalSupply = BigInt(mkt.totalSupplyAssets.toString());
      const totalBorrow = BigInt(mkt.totalBorrowAssets.toString());
      const expectedVault = totalSupply - totalBorrow;

      assert.equal(
        vaultBalance.toString(),
        expectedVault.toString(),
        "vault balance should equal supply - borrow"
      );
    });
  });
});
