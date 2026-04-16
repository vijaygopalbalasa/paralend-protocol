import {
  AnchorProvider,
  BN,
  Program,
  type IdlAccounts,
} from "@coral-xyz/anchor";
import {
  type AccountMeta,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import type { Paralend } from "../../target/types/paralend";
import IDL from "../../target/idl/paralend.json";

import { PROGRAM_ID } from "./constants";
import {
  deriveCollateralVaultPDA,
  deriveLinearIrmPDA,
  deriveLoanVaultPDA,
  deriveMarketPDA,
  derivePositionPDA,
  derivePriceCachePDA,
  deriveProtocolStatePDA,
} from "./pdas";
import type { MarketState, PositionState } from "./types";
import { computeMarketId } from "./math";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Anchor 0.31 returns u128/i128 as BN. Convert to bigint.
 */
function bnToBigInt(v: BN | bigint | number): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  return BigInt(v.toString());
}

/**
 * Convert a bigint to the BN that Anchor expects for u128/i128 args.
 */
function bigIntToBN(v: bigint): BN {
  return new BN(v.toString());
}

/**
 * Convert an Anchor-decoded Market account to our SDK MarketState.
 */
function decodeMarket(raw: IdlAccounts<Paralend>["market"]): MarketState {
  return {
    bump: raw.bump,
    collateralVaultBump: raw.collateralVaultBump,
    loanVaultBump: raw.loanVaultBump,
    collateralMint: raw.collateralMint,
    loanMint: raw.loanMint,
    collateralDecimals: raw.collateralDecimals,
    loanDecimals: raw.loanDecimals,
    collateralOracleFeedId: Array.from(raw.collateralOracleFeedId),
    loanOracleFeedId: Array.from(raw.loanOracleFeedId),
    irm: raw.irm,
    lltv: bnToBigInt(raw.lltv),
    fee: bnToBigInt(raw.fee),
    totalSupplyAssets: bnToBigInt(raw.totalSupplyAssets),
    totalSupplyShares: bnToBigInt(raw.totalSupplyShares),
    totalBorrowAssets: bnToBigInt(raw.totalBorrowAssets),
    totalBorrowShares: bnToBigInt(raw.totalBorrowShares),
    pendingFeeShares: bnToBigInt(raw.pendingFeeShares),
    lastUpdate: bnToBigInt(raw.lastUpdate),
    paused: raw.paused,
    marketStatus: raw.marketStatus,
    outcomeBit: raw.outcomeBit,
    resolutionTimestamp: bnToBigInt(raw.resolutionTimestamp),
    baseLltv: bnToBigInt(raw.baseLltv),
    kalshiTicker: Array.from(raw.kalshiTicker),
  };
}

/**
 * Convert an Anchor-decoded Position account to our SDK PositionState.
 */
function decodePosition(
  raw: IdlAccounts<Paralend>["position"]
): PositionState {
  return {
    bump: raw.bump,
    marketId: Array.from(raw.marketId),
    owner: raw.owner,
    supplyShares: bnToBigInt(raw.supplyShares),
    borrowShares: bnToBigInt(raw.borrowShares),
    collateral: bnToBigInt(raw.collateral),
  };
}

// ─── ParalendClient ────────────────────────────────────────────────────────────

export class ParalendClient {
  readonly program: Program<Paralend>;
  readonly provider: AnchorProvider;

  constructor(provider: AnchorProvider, programId: PublicKey = PROGRAM_ID) {
    this.provider = provider;
    const idl = {
      // Anchor 0.31 reads the program id from the IDL address field.
      ...(IDL as Record<string, unknown>),
      address: programId.toBase58(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.program = new Program<Paralend>(idl as any, provider);
  }

  // ─── Account Fetchers ──────────────────────────────────────────────────────

  /**
   * Fetch and decode a Market account by its 32-byte market ID.
   */
  async getMarket(marketId: Buffer): Promise<MarketState> {
    const [marketPda] = deriveMarketPDA(marketId);
    const raw = await this.program.account.market.fetch(marketPda);
    return decodeMarket(raw);
  }

  /**
   * Fetch and decode a Position account.
   */
  async getPosition(
    marketId: Buffer,
    owner: PublicKey
  ): Promise<PositionState> {
    const [positionPda] = derivePositionPDA(marketId, owner);
    const raw = await this.program.account.position.fetch(positionPda);
    return decodePosition(raw);
  }

  /**
   * Fetch all Market accounts from the program.
   *
   * Returns `{ publicKey, marketId, market }` triples.
   *
   * The Market account stores all five market-defining parameters, so we can
   * recover the deterministic market ID client-side.
   */
  async getAllMarkets(): Promise<
    { publicKey: PublicKey; marketId: Buffer; market: MarketState }[]
  > {
    const accounts = await this.program.account.market.all();
    return accounts.map((a) => ({
      publicKey: a.publicKey,
      marketId: computeMarketId({
        collateralMint: a.account.collateralMint,
        loanMint: a.account.loanMint,
        collateralOracleFeedId: Buffer.from(a.account.collateralOracleFeedId),
        loanOracleFeedId: Buffer.from(a.account.loanOracleFeedId),
        irm: a.account.irm,
        lltv: bnToBigInt(a.account.lltv),
      }),
      market: decodeMarket(a.account),
    }));
  }

  /**
   * Fetch and decode a Market account by its address.
   */
  async getMarketByAddress(address: PublicKey): Promise<{
    publicKey: PublicKey;
    marketId: Buffer;
    market: MarketState;
  }> {
    const raw = await this.program.account.market.fetch(address);
    const market = decodeMarket(raw);
    const marketId = computeMarketId({
      collateralMint: market.collateralMint,
      loanMint: market.loanMint,
      collateralOracleFeedId: Buffer.from(market.collateralOracleFeedId),
      loanOracleFeedId: Buffer.from(market.loanOracleFeedId),
      irm: market.irm,
      lltv: market.lltv,
    });

    return { publicKey: address, marketId, market };
  }

  /**
   * Fetch the protocol singleton.
   */
  async getProtocolState() {
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);
    return this.program.account.protocolState.fetch(protocolState);
  }

  // ─── Instruction Builders ─────────────────────────────────────────────────
  //
  // All builders return a TransactionInstruction so callers can compose them
  // into larger transactions (e.g. createPosition + supply in one tx).

  /**
   * Build a `createPosition` instruction.
   */
  async createPositionIx(params: {
    marketId: Buffer;
    owner: PublicKey;
    payer?: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, owner, payer = owner } = params;
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);
    const [positionPda] = derivePositionPDA(
      marketId,
      owner,
      this.program.programId
    );

    return this.program.methods
      .createPosition(
        Array.from(marketId) as unknown as number[] & { length: 32 }
      )
      .accountsPartial({
        payer,
        owner,
        market: marketPda,
        position: positionPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Build a `closePosition` instruction.
   *
   * Closes an empty position and returns rent to the specified recipient.
   * The position must have 0 supply shares, 0 borrow shares, and 0 collateral.
   *
   * @param marketId       32-byte market ID
   * @param owner          Signer — must be the position owner
   * @param rentRecipient  Account to receive the reclaimed rent (typically the owner)
   */
  async closePositionIx(params: {
    marketId: Buffer;
    owner: PublicKey;
    rentRecipient?: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, owner, rentRecipient = owner } = params;
    const [positionPda] = derivePositionPDA(
      marketId,
      owner,
      this.program.programId
    );

    return this.program.methods
      .closePosition(
        Array.from(marketId) as unknown as number[] & { length: 32 }
      )
      .accountsPartial({
        owner,
        rentRecipient,
        position: positionPda,
      })
      .instruction();
  }

  /**
   * Build a `createMarket` instruction and return its derived addresses.
   */
  async createMarketIx(params: {
    collateralMint: PublicKey;
    loanMint: PublicKey;
    collateralOracleFeedId: Buffer;
    loanOracleFeedId: Buffer;
    irm: PublicKey;
    lltv: bigint;
    fee: bigint;
    /**
     * Unix seconds when this prediction market resolves. Pass 0 to
     * create a classical lending market (no time-decay, no force-close).
     */
    resolutionTimestamp: bigint;
    /** Kalshi ticker (UTF-8, zero-padded to 48 bytes). */
    kalshiTicker: Buffer;
    payer: PublicKey;
  }): Promise<{
    marketId: Buffer;
    marketAddress: PublicKey;
    collateralVault: PublicKey;
    loanVault: PublicKey;
    instruction: TransactionInstruction;
  }> {
    const {
      collateralMint,
      loanMint,
      collateralOracleFeedId,
      loanOracleFeedId,
      irm,
      lltv,
      fee,
      resolutionTimestamp,
      kalshiTicker,
      payer,
    } = params;
    if (kalshiTicker.length !== 48) {
      throw new Error(
        `kalshiTicker must be exactly 48 bytes (got ${kalshiTicker.length})`
      );
    }
    const marketId = computeMarketId({
      collateralMint,
      loanMint,
      collateralOracleFeedId,
      loanOracleFeedId,
      irm,
      lltv,
    });
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);
    const [marketAddress] = deriveMarketPDA(marketId, this.program.programId);
    const [collateralVault] = deriveCollateralVaultPDA(
      marketId,
      this.program.programId
    );
    const [loanVault] = deriveLoanVaultPDA(marketId, this.program.programId);

    const instruction = await this.program.methods
      .createMarket(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        Array.from(collateralOracleFeedId) as unknown as number[] & {
          length: 32;
        },
        Array.from(loanOracleFeedId) as unknown as number[] & { length: 32 },
        irm,
        bigIntToBN(lltv),
        bigIntToBN(fee),
        new BN(resolutionTimestamp.toString()),
        Array.from(kalshiTicker) as unknown as number[] & { length: 48 }
      )
      .accountsPartial({
        payer,
        protocolState,
        collateralMint,
        loanMint,
        irmAccount: irm,
        market: marketAddress,
        collateralVault,
        loanVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    return {
      marketId,
      marketAddress,
      collateralVault,
      loanVault,
      instruction,
    };
  }

  /**
   * Build a `supply` instruction.
   *
   * Supplier must have an existing Position account (call `createPosition` first).
   * The instruction transfers `assets` loan tokens from `supplierLoanAta` into
   * the market's loan vault and mints supply shares to the position.
   *
   * @param marketId   32-byte market ID
   * @param assets     Amount of loan tokens (in base units, u64)
   * @param supplier   Signer — must own the position and the ATA
   * @param minShares  Minimum shares to receive (slippage protection, default 0n = no check)
   */
  async supplyIx(params: {
    marketId: Buffer;
    assets: bigint;
    supplier: PublicKey;
    minShares?: bigint;
  }): Promise<TransactionInstruction> {
    const { marketId, assets, supplier, minShares = 0n } = params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, supplier);
    const [loanVaultPda] = deriveLoanVaultPDA(marketId);

    // Fetch market to get irm and loan mint
    const market = await this.getMarket(marketId);
    const supplierLoanAta = getAssociatedTokenAddressSync(
      market.loanMint,
      supplier
    );

    return this.program.methods
      .supply(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(assets.toString()),
        bigIntToBN(minShares)
      )
      .accountsPartial({
        supplier,
        market: marketPda,
        irm: market.irm,
        position: positionPda,
        supplierLoanAta,
        loanVault: loanVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build a `withdraw` instruction.
   *
   * Specify exactly one of `assets` or `shares` (the other must be 0n):
   * - `assets > 0`: withdraw exactly that many tokens, burns the required shares
   * - `shares > 0`: burn exactly that many shares, receive the resulting tokens
   *
   * @param owner          Signer — owner of the position
   * @param receiver       Public key of the ATA that will receive the loan tokens
   * @param maxSharesBurn  When withdrawing by assets, max shares willing to burn (slippage protection, default 0n = no check)
   * @param minAssetsOut   When withdrawing by shares, min assets to receive (slippage protection, default 0n = no check)
   */
  async withdrawIx(params: {
    marketId: Buffer;
    assets: bigint;
    shares: bigint;
    owner: PublicKey;
    receiver: PublicKey;
    maxSharesBurn?: bigint;
    minAssetsOut?: bigint;
  }): Promise<TransactionInstruction> {
    const { marketId, assets, shares, owner, receiver, maxSharesBurn = 0n, minAssetsOut = 0n } = params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, owner);
    const [loanVaultPda] = deriveLoanVaultPDA(marketId);

    const market = await this.getMarket(marketId);
    const receiverLoanAta = getAssociatedTokenAddressSync(
      market.loanMint,
      receiver
    );

    return this.program.methods
      .withdraw(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(assets.toString()),
        bigIntToBN(shares),
        bigIntToBN(maxSharesBurn),
        bigIntToBN(minAssetsOut)
      )
      .accountsPartial({
        owner,
        market: marketPda,
        irm: market.irm,
        position: positionPda,
        loanVault: loanVaultPda,
        receiverLoanAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build a `supplyCollateral` instruction.
   *
   * Deposits `amount` collateral tokens from `depositorCollateralAta` into the
   * market's collateral vault and increments the position's collateral balance.
   *
   * Does NOT require the market to be unpaused (collateral ops always allowed).
   *
   * @param depositor  Signer — must own the position and the ATA
   */
  async supplyCollateralIx(params: {
    marketId: Buffer;
    amount: bigint;
    depositor: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, amount, depositor } = params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, depositor);
    const [collateralVaultPda] = deriveCollateralVaultPDA(marketId);

    const market = await this.getMarket(marketId);
    const depositorCollateralAta = getAssociatedTokenAddressSync(
      market.collateralMint,
      depositor
    );

    return this.program.methods
      .supplyCollateral(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(amount.toString())
      )
      .accountsPartial({
        depositor,
        market: marketPda,
        position: positionPda,
        depositorCollateralAta,
        collateralVault: collateralVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build a `withdrawCollateral` instruction.
   *
   * Withdraws `amount` collateral tokens from the market vault. When the
   * position carries debt, the on-chain health check reads from the
   * market's PriceCache PDA (derived automatically).
   */
  async withdrawCollateralIx(params: {
    marketId: Buffer;
    amount: bigint;
    owner: PublicKey;
    receiver: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, amount, owner, receiver } = params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, owner);
    const [collateralVaultPda] = deriveCollateralVaultPDA(marketId);
    const [priceCachePda] = derivePriceCachePDA(marketId);

    const market = await this.getMarket(marketId);
    const receiverCollateralAta = getAssociatedTokenAddressSync(
      market.collateralMint,
      receiver
    );

    return this.program.methods
      .withdrawCollateral(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(amount.toString())
      )
      .accountsPartial({
        owner,
        market: marketPda,
        irm: market.irm,
        position: positionPda,
        collateralVault: collateralVaultPda,
        receiverCollateralAta,
        priceCache: priceCachePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build a `borrow` instruction. The post-borrow health check reads the
   * market's PriceCache (derived from marketId, not passed by caller).
   *
   * @param maxShares  Max debt shares willing to take on (slippage protection;
   *                   0n = no check).
   */
  async borrowIx(params: {
    marketId: Buffer;
    assets: bigint;
    borrower: PublicKey;
    receiver: PublicKey;
    maxShares?: bigint;
  }): Promise<TransactionInstruction> {
    const { marketId, assets, borrower, receiver, maxShares = 0n } = params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, borrower);
    const [loanVaultPda] = deriveLoanVaultPDA(marketId);
    const [priceCachePda] = derivePriceCachePDA(marketId);

    const market = await this.getMarket(marketId);
    const receiverLoanAta = getAssociatedTokenAddressSync(
      market.loanMint,
      receiver
    );

    return this.program.methods
      .borrow(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(assets.toString()),
        bigIntToBN(maxShares)
      )
      .accountsPartial({
        borrower,
        market: marketPda,
        irm: market.irm,
        position: positionPda,
        loanVault: loanVaultPda,
        receiverLoanAta,
        priceCache: priceCachePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build a `repay` instruction.
   *
   * Repays debt for `borrower`'s position. Caller (`repayer`) may differ from
   * `borrower` — anyone can repay on behalf of anyone.
   *
   * Specify exactly one of `assets` or `shares` (the other must be 0n).
   *
   * @param repayer   Signer — pays the loan tokens
   * @param borrower  Whose position debt is being cleared
   */
  async repayIx(params: {
    marketId: Buffer;
    assets: bigint;
    shares: bigint;
    repayer: PublicKey;
    borrower: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, assets, shares, repayer, borrower } = params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, borrower);
    const [loanVaultPda] = deriveLoanVaultPDA(marketId);

    const market = await this.getMarket(marketId);
    const repayerLoanAta = getAssociatedTokenAddressSync(
      market.loanMint,
      repayer
    );

    return this.program.methods
      .repay(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(assets.toString()),
        bigIntToBN(shares)
      )
      .accountsPartial({
        repayer,
        market: marketPda,
        irm: market.irm,
        position: positionPda,
        borrower,
        repayerLoanAta,
        loanVault: loanVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build an `accrueInterest` instruction.
   */
  async accrueInterestIx(params: {
    marketId: Buffer;
  }): Promise<TransactionInstruction> {
    const { marketId } = params;
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);
    const market = await this.getMarket(marketId);

    return this.program.methods
      .accrueInterest(
        Array.from(marketId) as unknown as number[] & { length: 32 }
      )
      .accountsPartial({
        market: marketPda,
        irm: market.irm,
      })
      .instruction();
  }

  /**
   * Build a `liquidate` instruction. PriceCache is derived from marketId.
   */
  async liquidateIx(params: {
    marketId: Buffer;
    seizedCollateral: bigint;
    liquidator: PublicKey;
    borrower: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, seizedCollateral, liquidator, borrower } = params;
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);
    const [positionPda] = derivePositionPDA(
      marketId,
      borrower,
      this.program.programId
    );
    const [loanVaultPda] = deriveLoanVaultPDA(marketId, this.program.programId);
    const [collateralVaultPda] = deriveCollateralVaultPDA(
      marketId,
      this.program.programId
    );
    const [priceCachePda] = derivePriceCachePDA(
      marketId,
      this.program.programId
    );
    const market = await this.getMarket(marketId);
    const liquidatorLoanAta = getAssociatedTokenAddressSync(
      market.loanMint,
      liquidator
    );
    const liquidatorCollateralAta = getAssociatedTokenAddressSync(
      market.collateralMint,
      liquidator
    );

    return this.program.methods
      .liquidate(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        bigIntToBN(seizedCollateral)
      )
      .accountsPartial({
        liquidator,
        market: marketPda,
        irm: market.irm,
        borrowerPosition: positionPda,
        borrower,
        liquidatorLoanAta,
        loanVault: loanVaultPda,
        collateralVault: collateralVaultPda,
        liquidatorCollateralAta,
        priceCache: priceCachePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  // ─── Admin Instructions ─────────────────────────────────────────────────────

  /**
   * Build an `initializeProtocol` instruction.
   * Only callable once to create the protocol singleton.
   */
  async initializeProtocolIx(params: {
    payer: PublicKey;
    owner: PublicKey;
    feeRecipient: PublicKey;
  }): Promise<TransactionInstruction> {
    const { payer, owner, feeRecipient } = params;
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);

    return this.program.methods
      .initializeProtocol(owner, feeRecipient)
      .accountsPartial({
        payer,
        protocolState,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Build an `enableLltv` instruction.
   * Only callable by protocol owner.
   */
  async enableLltvIx(params: {
    owner: PublicKey;
    lltv: bigint;
  }): Promise<TransactionInstruction> {
    const { owner, lltv } = params;
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);

    return this.program.methods
      .enableLltv(bigIntToBN(lltv))
      .accountsPartial({
        owner,
        protocolState,
      })
      .instruction();
  }

  /**
   * Build an `enableIrm` instruction.
   * Only callable by protocol owner.
   */
  async enableIrmIx(params: {
    owner: PublicKey;
    irm: PublicKey;
  }): Promise<TransactionInstruction> {
    const { owner, irm } = params;
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);

    return this.program.methods
      .enableIrm(irm)
      .accountsPartial({
        owner,
        protocolState,
      })
      .instruction();
  }

  /**
   * Build a `createIrm` instruction.
   * Creates a new LinearIrm PDA.
   */
  async createIrmIx(params: {
    payer: PublicKey;
    baseRate: bigint;
    slope1: bigint;
    slope2: bigint;
    kink: bigint;
    nonce: bigint;
  }): Promise<{ instruction: TransactionInstruction; irmPda: PublicKey }> {
    const { payer, baseRate, slope1, slope2, kink, nonce } = params;
    const [irmPda] = deriveLinearIrmPDA(payer, nonce, this.program.programId);

    const instruction = await this.program.methods
      .createIrm(
        bigIntToBN(baseRate),
        bigIntToBN(slope1),
        bigIntToBN(slope2),
        bigIntToBN(kink),
        bigIntToBN(nonce)
      )
      .accountsPartial({
        payer,
        irm: irmPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    return { instruction, irmPda };
  }

  /**
   * Build a `createStaticOracle` instruction.
   * Creates a StaticOracle PDA for testing.
   */
  /**
   * Build a `registerPriceCache` instruction. Owner-only. Creates the
   * per-market PriceCache PDA and seeds it with an initial price.
   */
  async registerPriceCacheIx(params: {
    payer: PublicKey;
    marketId: Buffer;
    attester: PublicKey;
    initialPriceWad: bigint;
  }): Promise<{ instruction: TransactionInstruction; priceCachePda: PublicKey }> {
    const { payer, marketId, attester, initialPriceWad } = params;
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);
    const [priceCachePda] = derivePriceCachePDA(
      marketId,
      this.program.programId
    );

    const instruction = await this.program.methods
      .registerPriceCache(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        attester,
        bigIntToBN(initialPriceWad)
      )
      .accountsPartial({
        payer,
        protocolState,
        market: marketPda,
        priceCache: priceCachePda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    return { instruction, priceCachePda };
  }

  /**
   * Build an `attestPrice` instruction. Signer must be the cache's attester.
   */
  async attestPriceIx(params: {
    attester: PublicKey;
    marketId: Buffer;
    newSpotWad: bigint;
  }): Promise<TransactionInstruction> {
    const { attester, marketId, newSpotWad } = params;
    const [priceCachePda] = derivePriceCachePDA(
      marketId,
      this.program.programId
    );

    return this.program.methods
      .attestPrice(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        bigIntToBN(newSpotWad)
      )
      .accountsPartial({
        attester,
        priceCache: priceCachePda,
      })
      .instruction();
  }

  /**
   * Build a permissionless `pokePrice` instruction (crank slot stamp only).
   */
  async pokePriceIx(params: {
    marketId: Buffer;
  }): Promise<TransactionInstruction> {
    const { marketId } = params;
    const [priceCachePda] = derivePriceCachePDA(
      marketId,
      this.program.programId
    );

    return this.program.methods
      .pokePrice(Array.from(marketId) as unknown as number[] & { length: 32 })
      .accountsPartial({
        priceCache: priceCachePda,
      })
      .instruction();
  }

  /**
   * Build a `setFee` instruction.
   * Only callable by protocol owner.
   */
  async setFeeIx(params: {
    owner: PublicKey;
    marketId: Buffer;
    fee: bigint;
  }): Promise<TransactionInstruction> {
    const { owner, marketId, fee } = params;
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);

    return this.program.methods
      .setFee(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        bigIntToBN(fee)
      )
      .accountsPartial({
        owner,
        protocolState,
        market: marketPda,
      })
      .instruction();
  }

  /**
   * Build a `claimFees` instruction.
   * Only callable by fee_recipient from protocol state.
   * Fee recipient must have a Position in the market first.
   */
  async claimFeesIx(params: {
    feeRecipient: PublicKey;
    marketId: Buffer;
  }): Promise<TransactionInstruction> {
    const { feeRecipient, marketId } = params;
    const [protocolState] = deriveProtocolStatePDA(this.program.programId);
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);
    const [positionPda] = derivePositionPDA(
      marketId,
      feeRecipient,
      this.program.programId
    );

    return this.program.methods
      .claimFees(Array.from(marketId) as unknown as number[] & { length: 32 })
      .accountsPartial({
        feeRecipient,
        protocolState,
        market: marketPda,
        position: positionPda,
      })
      .instruction();
  }

  // ─── Resolution Instructions ──────────────────────────────────────────────

  /**
   * Build a `forceClosePosition` instruction.
   * Callable by any liquidator during the 2-hour force-close window.
   */
  async forceClosePositionIx(params: {
    marketId: Buffer;
    liquidator: PublicKey;
    borrower: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, liquidator, borrower } = params;
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);
    const [positionPda] = derivePositionPDA(
      marketId,
      borrower,
      this.program.programId
    );
    const [loanVaultPda] = deriveLoanVaultPDA(marketId, this.program.programId);
    const [collateralVaultPda] = deriveCollateralVaultPDA(
      marketId,
      this.program.programId
    );
    const [priceCachePda] = derivePriceCachePDA(
      marketId,
      this.program.programId
    );
    const market = await this.getMarket(marketId);
    const liquidatorLoanAta = getAssociatedTokenAddressSync(
      market.loanMint,
      liquidator
    );
    const liquidatorCollateralAta = getAssociatedTokenAddressSync(
      market.collateralMint,
      liquidator
    );

    return this.program.methods
      .forceClosePosition(
        Array.from(marketId) as unknown as number[] & { length: 32 }
      )
      .accountsPartial({
        liquidator,
        market: marketPda,
        irm: market.irm,
        borrowerPosition: positionPda,
        borrower,
        liquidatorLoanAta,
        loanVault: loanVaultPda,
        collateralVault: collateralVaultPda,
        liquidatorCollateralAta,
        priceCache: priceCachePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build a `handleResolution` instruction. Signer must be the market's
   * registered attester.
   */
  async handleResolutionIx(params: {
    attester: PublicKey;
    marketId: Buffer;
    outcomeBit: 1 | 2;
  }): Promise<TransactionInstruction> {
    const { attester, marketId, outcomeBit } = params;
    const [marketPda] = deriveMarketPDA(marketId, this.program.programId);
    const [priceCachePda] = derivePriceCachePDA(
      marketId,
      this.program.programId
    );

    return this.program.methods
      .handleResolution(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        outcomeBit
      )
      .accountsPartial({
        attester,
        market: marketPda,
        priceCache: priceCachePda,
      })
      .instruction();
  }

  // ─── Convenience Helpers ──────────────────────────────────────────────────

  /**
   * Derive all PDAs for a market in one call.
   * Useful for building multi-instruction transactions.
   */
  deriveMarketAccounts(marketId: Buffer): {
    marketPda: PublicKey;
    collateralVaultPda: PublicKey;
    loanVaultPda: PublicKey;
  } {
    const [marketPda] = deriveMarketPDA(marketId);
    const [collateralVaultPda] = deriveCollateralVaultPDA(marketId);
    const [loanVaultPda] = deriveLoanVaultPDA(marketId);
    return { marketPda, collateralVaultPda, loanVaultPda };
  }

  /**
   * Derive the Position PDA for (marketId, owner).
   */
  derivePositionAddress(marketId: Buffer, owner: PublicKey): PublicKey {
    const [pda] = derivePositionPDA(marketId, owner);
    return pda;
  }

  /**
   * Check whether a Position account exists on-chain.
   * Returns true if it does, false if not (account has no data).
   */
  async positionExists(
    marketId: Buffer,
    owner: PublicKey
  ): Promise<boolean> {
    const pda = this.derivePositionAddress(marketId, owner);
    const info = await this.provider.connection.getAccountInfo(pda);
    return info !== null && info.data.length > 0;
  }

  /**
   * Send and confirm a transaction or instruction list with the provider wallet.
   */
  async sendAndConfirm(
    instructions:
      | Transaction
      | TransactionInstruction
      | TransactionInstruction[],
    signers: Parameters<AnchorProvider["sendAndConfirm"]>[1] = []
  ): Promise<string> {
    let tx: Transaction;
    if (instructions instanceof Transaction) {
      tx = instructions;
    } else {
      tx = new Transaction();
      const ixs = Array.isArray(instructions) ? instructions : [instructions];
      for (const ix of ixs) {
        tx.add(ix);
      }
    }

    return this.provider.sendAndConfirm(tx, signers);
  }
}
