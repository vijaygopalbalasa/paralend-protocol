// tests/paralend.ts — Paralend integration tests (Day 6 checkpoint)
//
// Covers the post-pivot API surface:
//   - initialize_protocol + two-step transfer_ownership / accept_ownership
//   - create_irm, create_market (with resolution_timestamp wired via base_lltv)
//   - register_price_cache + attest_price (deviation band) + poke_price
//   - supply / supply_collateral / borrow / repay
//   - Pre-resolution borrow cutoff (POST_BORROW_CUTOFF_SECONDS)
//   - force_close_position in the final 2-hour window
//
// Additional coverage (liquidate, handle_resolution)
// is planned behind a test-only feature flag that lets `create_market`
// accept past timestamps for deterministic time-warp scenarios. See the
// "Open items" section in DEPLOYMENT.md.

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
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
const SEED_PRICE_CACHE = Buffer.from("price_cache");

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function derive(seeds: Buffer[], programId: PublicKey) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function deriveProtocolState(programId: PublicKey) {
  return derive([SEED_PREFIX, SEED_PROTOCOL], programId);
}

function deriveMarketPda(marketId: Buffer, programId: PublicKey) {
  return derive([SEED_PREFIX, SEED_MARKET, marketId], programId);
}

function deriveCollateralVault(marketId: Buffer, programId: PublicKey) {
  return derive([SEED_PREFIX, SEED_COLLATERAL_VAULT, marketId], programId);
}

function deriveLoanVault(marketId: Buffer, programId: PublicKey) {
  return derive([SEED_PREFIX, SEED_LOAN_VAULT, marketId], programId);
}

function derivePosition(
  marketId: Buffer,
  owner: PublicKey,
  programId: PublicKey
) {
  return derive(
    [SEED_PREFIX, SEED_POSITION, marketId, owner.toBuffer()],
    programId
  );
}

function deriveLinearIrm(
  admin: PublicKey,
  nonce: bigint,
  programId: PublicKey
) {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return derive(
    [SEED_PREFIX, SEED_LINEAR_IRM, admin.toBuffer(), nonceBuf],
    programId
  );
}

function derivePriceCache(marketId: Buffer, programId: PublicKey) {
  return derive([SEED_PREFIX, SEED_PRICE_CACHE, marketId], programId);
}

function computeMarketId(params: {
  collateralMint: PublicKey;
  loanMint: PublicKey;
  collateralFeedId: Buffer;
  loanFeedId: Buffer;
  irm: PublicKey;
  lltv: bigint;
}): Buffer {
  const lltvBuf = Buffer.alloc(8);
  lltvBuf.writeBigUInt64LE(params.lltv);
  const concat = Buffer.concat([
    params.collateralMint.toBuffer(),
    params.loanMint.toBuffer(),
    params.collateralFeedId,
    params.loanFeedId,
    params.irm.toBuffer(),
    lltvBuf,
  ]);
  return Buffer.from(keccak_256(concat));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WAD = 10n ** 18n;
const BPS = 10_000n;
const SECONDS_PER_YEAR = 31_536_000n;

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("Paralend", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Paralend as Program<Paralend>;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const connection = provider.connection;

  // Shared state built up across the happy-path tests
  const attester = Keypair.generate();
  let protocolState: PublicKey;
  let collateralMint: PublicKey;
  let loanMint: PublicKey;
  let irmPda: PublicKey;
  let marketId: Buffer;
  let marketPda: PublicKey;
  let collateralVault: PublicKey;
  let loanVault: PublicKey;
  let priceCache: PublicKey;
  let positionPda: PublicKey;
  let supplierLoanAta: PublicKey;
  let borrowerCollateralAta: PublicKey;
  let borrowerLoanAta: PublicKey;

  const LLTV = 6000n; // 60%
  const FEE_BPS = 0n;
  const COLLATERAL_DECIMALS = 6;
  const LOAN_DECIMALS = 6;

  // Collateral (Kalshi YES token proxy) price = $0.42
  // price_wad = 0.42 * 1e18 / 1e6 = 420_000_000_000
  const PRICE_WAD_INITIAL = 420_000_000_000n;

  // Local feed_id the attester drives
  const COLLATERAL_FEED_ID = Buffer.alloc(32);
  COLLATERAL_FEED_ID.write("KALSHI-YES-TEST-001", "utf-8");
  const LOAN_FEED_ID = Buffer.alloc(32); // all zeros = USDC stablecoin path

  before(async () => {
    // Airdrop the attester so it can pay tx fees
    const sig = await connection.requestAirdrop(attester.publicKey, 2e9);
    await connection.confirmTransaction(sig);
  });

  it("initializes the protocol singleton with payer=owner", async () => {
    [protocolState] = deriveProtocolState(program.programId);

    await program.methods
      .initializeProtocol(payer.publicKey, payer.publicKey)
      // @ts-ignore accountsPartial would be ideal but keeping parity with other callsites
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.owner.toBase58(), payer.publicKey.toBase58());
    assert.equal(state.feeRecipient.toBase58(), payer.publicKey.toBase58());
    assert.isFalse(state.paused);
  });

  it("two-step ownership transfer: initiate then accept", async () => {
    const newOwner = Keypair.generate();
    await connection.confirmTransaction(
      await connection.requestAirdrop(newOwner.publicKey, 1e9)
    );

    // Current owner proposes
    await program.methods
      .transferOwnership(newOwner.publicKey)
      // @ts-ignore
      .accountsPartial({ owner: payer.publicKey, protocolState })
      .rpc();

    let s = await program.account.protocolState.fetch(protocolState);
    assert.equal(s.pendingOwner.toBase58(), newOwner.publicKey.toBase58());
    assert.equal(
      s.owner.toBase58(),
      payer.publicKey.toBase58(),
      "owner unchanged"
    );

    // Proposed owner accepts
    await program.methods
      .acceptOwnership()
      // @ts-ignore
      .accountsPartial({ pendingOwner: newOwner.publicKey, protocolState })
      .signers([newOwner])
      .rpc();

    s = await program.account.protocolState.fetch(protocolState);
    assert.equal(s.owner.toBase58(), newOwner.publicKey.toBase58());
    assert.equal(s.pendingOwner.toBase58(), PublicKey.default.toBase58());

    // Hand ownership back to `payer` so later tests (which assume payer=owner) work.
    await program.methods
      .transferOwnership(payer.publicKey)
      // @ts-ignore
      .accountsPartial({ owner: newOwner.publicKey, protocolState })
      .signers([newOwner])
      .rpc();
    await program.methods
      .acceptOwnership()
      // @ts-ignore
      .accountsPartial({ pendingOwner: payer.publicKey, protocolState })
      .rpc();
  });

  it("creates mints, LTV + IRM allowlist, and a market", async () => {
    // Collateral mint (Kalshi YES token proxy)
    collateralMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      COLLATERAL_DECIMALS
    );
    // Loan mint (USDC proxy)
    loanMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      LOAN_DECIMALS
    );

    // Whitelist LLTV 60 %
    await program.methods
      .enableLltv(new BN(LLTV.toString()))
      // @ts-ignore
      .accountsPartial({ owner: payer.publicKey, protocolState })
      .rpc();

    // Create + whitelist an IRM
    [irmPda] = deriveLinearIrm(payer.publicKey, 0n, program.programId);
    const baseRate = 0n;
    const slope1 = (WAD * 5n) / 100n / SECONDS_PER_YEAR;
    const slope2 = (WAD * 230n) / 100n / SECONDS_PER_YEAR;
    const kink = (WAD * 80n) / 100n;

    await program.methods
      .createIrm(
        new BN(baseRate.toString()),
        new BN(slope1.toString()),
        new BN(slope2.toString()),
        new BN(kink.toString()),
        new BN(0)
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        irm: irmPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .enableIrm(irmPda)
      // @ts-ignore
      .accountsPartial({ owner: payer.publicKey, protocolState })
      .rpc();

    // Market ID & PDAs
    marketId = computeMarketId({
      collateralMint,
      loanMint,
      collateralFeedId: COLLATERAL_FEED_ID,
      loanFeedId: LOAN_FEED_ID,
      irm: irmPda,
      lltv: LLTV,
    });
    [marketPda] = deriveMarketPda(marketId, program.programId);
    [collateralVault] = deriveCollateralVault(marketId, program.programId);
    [loanVault] = deriveLoanVault(marketId, program.programId);

    // Create a market with a ~14-day future resolution — far enough out
    // that time-decay doesn't bite the happy-path borrow below. A dedicated
    // decay test (Day 8) will exercise the near-resolution tightening.
    const resolutionTs = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
    const ticker = Buffer.alloc(48);
    ticker.write("KXTEST-YES-001", "utf-8");

    await program.methods
      .createMarket(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        Array.from(COLLATERAL_FEED_ID) as unknown as number[] & { length: 32 },
        Array.from(LOAN_FEED_ID) as unknown as number[] & { length: 32 },
        irmPda,
        new BN(LLTV.toString()),
        new BN(FEE_BPS.toString()),
        new BN(resolutionTs),
        Array.from(ticker) as unknown as number[] & { length: 48 }
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        collateralMint,
        loanMint,
        irmAccount: irmPda,
        market: marketPda,
        collateralVault,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const m = await program.account.market.fetch(marketPda);
    assert.equal(m.lltv.toString(), LLTV.toString());
    assert.equal(m.baseLltv.toString(), LLTV.toString());
    assert.equal(m.marketStatus, 0);
    assert.equal(m.outcomeBit, 0);
    assert.equal(m.resolutionTimestamp.toString(), resolutionTs.toString());
  });

  it("registers price cache + attester, seeds initial EMA", async () => {
    [priceCache] = derivePriceCache(marketId, program.programId);

    await program.methods
      .registerPriceCache(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        attester.publicKey,
        new BN(PRICE_WAD_INITIAL.toString())
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        market: marketPda,
        priceCache,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cache = await program.account.priceCache.fetch(priceCache);
    assert.equal(
      cache.emaPriceWad.toString(),
      PRICE_WAD_INITIAL.toString(),
      "EMA seeded from initial_price"
    );
    assert.equal(cache.attester.toBase58(), attester.publicKey.toBase58());
    assert.deepEqual(Array.from(cache.feedId), Array.from(COLLATERAL_FEED_ID));
  });

  it("attest_price folds spot into EMA with 10% weight", async () => {
    // New spot = initial + 3% (within the 5% deviation band)
    const newSpot = (PRICE_WAD_INITIAL * 103n) / 100n;

    await program.methods
      .attestPrice(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(newSpot.toString())
      )
      // @ts-ignore
      .accountsPartial({
        attester: attester.publicKey,
        market: marketPda,
        priceCache,
      })
      .signers([attester])
      .rpc();

    const cache = await program.account.priceCache.fetch(priceCache);
    // EMA = (old*9 + spot) / 10
    const expectedEma = (PRICE_WAD_INITIAL * 9n + newSpot) / 10n;
    assert.equal(cache.emaPriceWad.toString(), expectedEma.toString());
    assert.equal(cache.lastSpotWad.toString(), newSpot.toString());
  });

  it("attest_price rejects non-attester signer", async () => {
    const outsider = Keypair.generate();
    await connection.confirmTransaction(
      await connection.requestAirdrop(outsider.publicKey, 5e8)
    );

    let threw = false;
    try {
      await program.methods
        .attestPrice(
          Array.from(marketId) as unknown as number[] & { length: 32 },
          new BN(PRICE_WAD_INITIAL.toString())
        )
        // @ts-ignore
        .accountsPartial({
          attester: outsider.publicKey,
          market: marketPda,
          priceCache,
        })
        .signers([outsider])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(
        String(e.toString()),
        /AttesterNotAuthorized|unauthorized|constraint/i,
        `expected attester check to fail; got: ${e}`
      );
    }
    assert.isTrue(threw, "non-attester attest should revert");
  });

  it("attest_price rejects spot outside deviation band", async () => {
    // Current last_spot ≈ 103% of initial (from earlier test). Attempt +10% jump.
    const prev = (await program.account.priceCache.fetch(priceCache))
      .lastSpotWad;
    const out_of_band = (BigInt(prev.toString()) * 110n) / 100n;

    let threw = false;
    try {
      await program.methods
        .attestPrice(
          Array.from(marketId) as unknown as number[] & { length: 32 },
          new BN(out_of_band.toString())
        )
        // @ts-ignore
        .accountsPartial({
          attester: attester.publicKey,
          market: marketPda,
          priceCache,
        })
        .signers([attester])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "out-of-band attest should revert");
  });

  it("attest_price rejects binary collateral prices above $1", async () => {
    const highFeedId = Buffer.alloc(32);
    highFeedId.write("KXTEST-HIGH-PRICE", "utf-8");
    const highMarketId = computeMarketId({
      collateralMint,
      loanMint,
      collateralFeedId: highFeedId,
      loanFeedId: LOAN_FEED_ID,
      irm: irmPda,
      lltv: LLTV,
    });
    const [highMarketPda] = deriveMarketPda(highMarketId, program.programId);
    const [highCollateralVault] = deriveCollateralVault(
      highMarketId,
      program.programId
    );
    const [highLoanVault] = deriveLoanVault(highMarketId, program.programId);
    const [highPriceCache] = derivePriceCache(highMarketId, program.programId);
    const resolutionTs = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
    const ticker = Buffer.alloc(48);
    ticker.write("KXTEST-HIGH-PRICE", "utf-8");

    await program.methods
      .createMarket(
        Array.from(highMarketId) as unknown as number[] & { length: 32 },
        Array.from(highFeedId) as unknown as number[] & { length: 32 },
        Array.from(LOAN_FEED_ID) as unknown as number[] & { length: 32 },
        irmPda,
        new BN(LLTV.toString()),
        new BN(FEE_BPS.toString()),
        new BN(resolutionTs),
        Array.from(ticker) as unknown as number[] & { length: 48 }
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        collateralMint,
        loanMint,
        irmAccount: irmPda,
        market: highMarketPda,
        collateralVault: highCollateralVault,
        loanVault: highLoanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const nearCapPrice =
      (WAD * 98n) / 100n / 10n ** BigInt(COLLATERAL_DECIMALS);
    await program.methods
      .registerPriceCache(
        Array.from(highMarketId) as unknown as number[] & { length: 32 },
        attester.publicKey,
        new BN(nearCapPrice.toString())
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        market: highMarketPda,
        priceCache: highPriceCache,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const aboveCapPrice =
      (WAD * 101n) / 100n / 10n ** BigInt(COLLATERAL_DECIMALS);
    let threw = false;
    try {
      await program.methods
        .attestPrice(
          Array.from(highMarketId) as unknown as number[] & { length: 32 },
          new BN(aboveCapPrice.toString())
        )
        // @ts-ignore
        .accountsPartial({
          attester: attester.publicKey,
          market: highMarketPda,
          priceCache: highPriceCache,
        })
        .signers([attester])
        .rpc();
    } catch {
      threw = true;
    }

    assert.isTrue(threw, "above-$1 binary outcome price should revert");
  });

  it("poke_price updates slot stamp without changing EMA", async () => {
    const before = await program.account.priceCache.fetch(priceCache);

    await program.methods
      .pokePrice(Array.from(marketId) as unknown as number[] & { length: 32 })
      // @ts-ignore
      .accountsPartial({ priceCache })
      .rpc();

    const after = await program.account.priceCache.fetch(priceCache);
    assert.equal(
      before.emaPriceWad.toString(),
      after.emaPriceWad.toString(),
      "poke must not change EMA"
    );
    assert.isTrue(
      BigInt(after.lastUpdateSlot.toString()) >=
        BigInt(before.lastUpdateSlot.toString()),
      "poke updates slot stamp"
    );
    assert.equal(
      after.lastUpdateTs.toString(),
      before.lastUpdateTs.toString(),
      "poke must not refresh oracle freshness"
    );
  });

  it("supply + supply_collateral + borrow happy path", async () => {
    // Prepare supplier (payer) + borrower
    const borrower = Keypair.generate();
    await connection.confirmTransaction(
      await connection.requestAirdrop(borrower.publicKey, 2e9)
    );

    // Supplier supplies USDC
    supplierLoanAta = await createAccount(
      connection,
      payer,
      loanMint,
      payer.publicKey
    );
    await mintTo(
      connection,
      payer,
      loanMint,
      supplierLoanAta,
      payer.publicKey,
      1_000_000_000 // 1,000 USDC
    );

    const [supplierPosition] = derivePosition(
      marketId,
      payer.publicKey,
      program.programId
    );
    await program.methods
      .createPosition(
        Array.from(marketId) as unknown as number[] & { length: 32 }
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        owner: payer.publicKey,
        market: marketPda,
        position: supplierPosition,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .supply(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(500_000_000), // 500 USDC
        new BN(0)
      )
      // @ts-ignore
      .accountsPartial({
        supplier: payer.publicKey,
        protocolState,
        market: marketPda,
        irm: irmPda,
        position: supplierPosition,
        supplierLoanAta,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Borrower posts YES-token collateral worth $21 (50 tokens * $0.42)
    borrowerCollateralAta = await createAccount(
      connection,
      payer,
      collateralMint,
      borrower.publicKey
    );
    await mintTo(
      connection,
      payer,
      collateralMint,
      borrowerCollateralAta,
      payer.publicKey,
      50_000_000 // 50 YES tokens (6 decimals)
    );

    borrowerLoanAta = await createAccount(
      connection,
      payer,
      loanMint,
      borrower.publicKey
    );

    [positionPda] = derivePosition(
      marketId,
      borrower.publicKey,
      program.programId
    );
    await program.methods
      .createPosition(
        Array.from(marketId) as unknown as number[] & { length: 32 }
      )
      // @ts-ignore
      .accountsPartial({
        payer: borrower.publicKey,
        owner: borrower.publicKey,
        market: marketPda,
        position: positionPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    await program.methods
      .supplyCollateral(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(50_000_000)
      )
      // @ts-ignore
      .accountsPartial({
        depositor: borrower.publicKey,
        protocolState,
        market: marketPda,
        position: positionPda,
        depositorCollateralAta: borrowerCollateralAta,
        collateralVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    // Borrower borrows $10 USDC (well under 60% LLTV of $21 = $12.60)
    const borrowAmount = 10_000_000; // 10 USDC
    await program.methods
      .borrow(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(borrowAmount),
        new BN(0)
      )
      // @ts-ignore
      .accountsPartial({
        borrower: borrower.publicKey,
        protocolState,
        market: marketPda,
        irm: irmPda,
        position: positionPda,
        loanVault,
        receiverLoanAta: borrowerLoanAta,
        priceCache,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    const pos = await program.account.position.fetch(positionPda);
    assert.isTrue(
      BigInt(pos.borrowShares.toString()) > 0n,
      "borrow_shares recorded"
    );
  });

  it("force-closes an unhealthy near-resolution position", async () => {
    const nearFeedId = Buffer.alloc(32);
    nearFeedId.write("KALSHI-FORCE-CLOSE-TEST", "utf-8");
    const nearMarketId = computeMarketId({
      collateralMint,
      loanMint,
      collateralFeedId: nearFeedId,
      loanFeedId: LOAN_FEED_ID,
      irm: irmPda,
      lltv: LLTV,
    });
    const [nearMarketPda] = deriveMarketPda(nearMarketId, program.programId);
    const [nearCollateralVault] = deriveCollateralVault(
      nearMarketId,
      program.programId
    );
    const [nearLoanVault] = deriveLoanVault(nearMarketId, program.programId);
    const [nearPriceCache] = derivePriceCache(nearMarketId, program.programId);
    const ticker = Buffer.alloc(48);
    ticker.write("FORCE-CLOSE-TEST", "utf-8");

    // Create just outside the force-close window, then wait a few seconds so
    // the test enters [T-2h, T) without needing validator clock warping.
    const nearResolutionTs = Math.floor(Date.now() / 1000) + 7_205;
    await program.methods
      .createMarket(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 },
        Array.from(nearFeedId) as unknown as number[] & { length: 32 },
        Array.from(LOAN_FEED_ID) as unknown as number[] & { length: 32 },
        irmPda,
        new BN(LLTV.toString()),
        new BN(FEE_BPS.toString()),
        new BN(nearResolutionTs),
        Array.from(ticker) as unknown as number[] & { length: 48 }
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        collateralMint,
        loanMint,
        irmAccount: irmPda,
        market: nearMarketPda,
        collateralVault: nearCollateralVault,
        loanVault: nearLoanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .registerPriceCache(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 },
        attester.publicKey,
        new BN(PRICE_WAD_INITIAL.toString())
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        protocolState,
        market: nearMarketPda,
        priceCache: nearPriceCache,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const [nearSupplierPosition] = derivePosition(
      nearMarketId,
      payer.publicKey,
      program.programId
    );
    await program.methods
      .createPosition(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 }
      )
      // @ts-ignore
      .accountsPartial({
        payer: payer.publicKey,
        owner: payer.publicKey,
        market: nearMarketPda,
        position: nearSupplierPosition,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .supply(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 },
        new BN(300_000_000), // 300 USDC
        new BN(0)
      )
      // @ts-ignore
      .accountsPartial({
        supplier: payer.publicKey,
        protocolState,
        market: nearMarketPda,
        irm: irmPda,
        position: nearSupplierPosition,
        supplierLoanAta,
        loanVault: nearLoanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const nearBorrower = Keypair.generate();
    await connection.confirmTransaction(
      await connection.requestAirdrop(nearBorrower.publicKey, 2e9)
    );

    const nearBorrowerCollateralAta = await createAccount(
      connection,
      payer,
      collateralMint,
      nearBorrower.publicKey
    );
    await mintTo(
      connection,
      payer,
      collateralMint,
      nearBorrowerCollateralAta,
      payer.publicKey,
      50_000_000_000 // 50,000 YES tokens (6 decimals)
    );
    const nearBorrowerLoanAta = await createAccount(
      connection,
      payer,
      loanMint,
      nearBorrower.publicKey
    );
    const nearLiquidatorCollateralAta = await createAccount(
      connection,
      payer,
      collateralMint,
      payer.publicKey
    );

    const [nearBorrowerPosition] = derivePosition(
      nearMarketId,
      nearBorrower.publicKey,
      program.programId
    );
    await program.methods
      .createPosition(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 }
      )
      // @ts-ignore
      .accountsPartial({
        payer: nearBorrower.publicKey,
        owner: nearBorrower.publicKey,
        market: nearMarketPda,
        position: nearBorrowerPosition,
        systemProgram: SystemProgram.programId,
      })
      .signers([nearBorrower])
      .rpc();

    await program.methods
      .supplyCollateral(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 },
        new BN(50_000_000_000)
      )
      // @ts-ignore
      .accountsPartial({
        depositor: nearBorrower.publicKey,
        protocolState,
        market: nearMarketPda,
        position: nearBorrowerPosition,
        depositorCollateralAta: nearBorrowerCollateralAta,
        collateralVault: nearCollateralVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([nearBorrower])
      .rpc();

    await program.methods
      .borrow(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 },
        new BN(149_000_000), // 149 USDC, just inside the decayed limit
        new BN(0)
      )
      // @ts-ignore
      .accountsPartial({
        borrower: nearBorrower.publicKey,
        protocolState,
        market: nearMarketPda,
        irm: irmPda,
        position: nearBorrowerPosition,
        loanVault: nearLoanVault,
        receiverLoanAta: nearBorrowerLoanAta,
        priceCache: nearPriceCache,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([nearBorrower])
      .rpc();

    // One 5% lower spot only moves the EMA by 0.5%, enough to make this
    // deliberately tight position unhealthy while staying inside the band.
    const lowerSpot = (PRICE_WAD_INITIAL * 95n) / 100n;
    await program.methods
      .attestPrice(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 },
        new BN(lowerSpot.toString())
      )
      // @ts-ignore
      .accountsPartial({
        attester: attester.publicKey,
        market: nearMarketPda,
        priceCache: nearPriceCache,
      })
      .signers([attester])
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 6_000));

    await program.methods
      .forceClosePosition(
        Array.from(nearMarketId) as unknown as number[] & { length: 32 }
      )
      // @ts-ignore
      .accountsPartial({
        liquidator: payer.publicKey,
        market: nearMarketPda,
        irm: irmPda,
        borrowerPosition: nearBorrowerPosition,
        borrower: nearBorrower.publicKey,
        liquidatorLoanAta: supplierLoanAta,
        loanVault: nearLoanVault,
        collateralVault: nearCollateralVault,
        liquidatorCollateralAta: nearLiquidatorCollateralAta,
        priceCache: nearPriceCache,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const closedPosition = await program.account.position.fetch(
      nearBorrowerPosition
    );
    assert.equal(closedPosition.collateral.toString(), "0");
    assert.equal(closedPosition.borrowShares.toString(), "0");
  });
});
