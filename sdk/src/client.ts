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
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import type { Nucleus } from "../../target/types/nucleus";
import IDL from "../../target/idl/nucleus.json";

import { PROGRAM_ID } from "./constants";
import {
  deriveCollateralVaultPDA,
  deriveLoanVaultPDA,
  deriveMarketPDA,
  derivePositionPDA,
  deriveProtocolStatePDA,
} from "./pdas";
import type { MarketState, PositionState } from "./types";

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
function decodeMarket(raw: IdlAccounts<Nucleus>["market"]): MarketState {
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
    flashLoanLock: raw.flashLoanLock,
  };
}

/**
 * Convert an Anchor-decoded Position account to our SDK PositionState.
 */
function decodePosition(
  raw: IdlAccounts<Nucleus>["position"]
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

// ─── NucleusClient ────────────────────────────────────────────────────────────

export class NucleusClient {
  readonly program: Program<Nucleus>;
  readonly provider: AnchorProvider;

  constructor(provider: AnchorProvider, programId: PublicKey = PROGRAM_ID) {
    this.provider = provider;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.program = new Program<Nucleus>(IDL as any, provider);
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
   * Returns an array of { marketId, market } pairs.
   */
  async getAllMarkets(): Promise<{ marketId: Buffer; market: MarketState }[]> {
    const accounts = await this.program.account.market.all();
    return accounts.map((a) => ({
      // Reconstruct the market ID from the PDA address by fetching it from
      // the decoded account (stored in market_id field of every Position, but
      // Market itself doesn't store the ID — we return the PDA key instead).
      // The canonical market ID is derived from params; here we expose the
      // account data plus its pubkey for callers to index however they like.
      marketId: Buffer.from(
        // market_id is not stored in the Market account itself; return a
        // placeholder zero buffer — callers should use computeMarketId() from
        // params when they need the canonical ID.
        new Uint8Array(32)
      ),
      market: decodeMarket(a.account),
      // attach pubkey for reference
      ...(a as unknown as { publicKey: PublicKey }),
    }));
  }

  // ─── Instruction Builders ─────────────────────────────────────────────────
  //
  // All builders return a TransactionInstruction so callers can compose them
  // into larger transactions (e.g. createPosition + supply in one tx).

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
   */
  async supplyIx(params: {
    marketId: Buffer;
    assets: bigint;
    supplier: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, assets, supplier } = params;
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
        new BN(assets.toString())
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
   * @param owner    Signer — owner of the position
   * @param receiver Public key of the ATA that will receive the loan tokens
   */
  async withdrawIx(params: {
    marketId: Buffer;
    assets: bigint;
    shares: bigint;
    owner: PublicKey;
    receiver: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, assets, shares, owner, receiver } = params;
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
        bigIntToBN(shares)
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
   * Withdraws `amount` collateral tokens from the market vault to `receiverCollateralAta`.
   * Requires oracle accounts for the post-withdrawal health check if the position has debt.
   *
   * @param owner               Signer — position owner
   * @param receiver            Destination for collateral tokens
   * @param collateralOracle    StaticOracle (or Pyth) PDA for the collateral
   * @param loanOracle          StaticOracle (or Pyth) PDA for the loan
   */
  async withdrawCollateralIx(params: {
    marketId: Buffer;
    amount: bigint;
    owner: PublicKey;
    receiver: PublicKey;
    collateralOracle: PublicKey;
    loanOracle: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, amount, owner, receiver, collateralOracle, loanOracle } =
      params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, owner);
    const [collateralVaultPda] = deriveCollateralVaultPDA(marketId);

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
        collateralOracle,
        loanOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Build a `borrow` instruction.
   *
   * Borrows `assets` loan tokens into `receiverLoanAta`. Requires collateral
   * already posted. Post-borrow health check is enforced on-chain.
   *
   * @param borrower            Signer — must own the position
   * @param receiver            Destination for borrowed tokens
   * @param collateralOracle    Oracle PDA for collateral price
   * @param loanOracle          Oracle PDA for loan price
   */
  async borrowIx(params: {
    marketId: Buffer;
    assets: bigint;
    borrower: PublicKey;
    receiver: PublicKey;
    collateralOracle: PublicKey;
    loanOracle: PublicKey;
  }): Promise<TransactionInstruction> {
    const { marketId, assets, borrower, receiver, collateralOracle, loanOracle } =
      params;
    const [marketPda] = deriveMarketPDA(marketId);
    const [positionPda] = derivePositionPDA(marketId, borrower);
    const [loanVaultPda] = deriveLoanVaultPDA(marketId);

    const market = await this.getMarket(marketId);
    const receiverLoanAta = getAssociatedTokenAddressSync(
      market.loanMint,
      receiver
    );

    return this.program.methods
      .borrow(
        Array.from(marketId) as unknown as number[] & { length: 32 },
        new BN(assets.toString())
      )
      .accountsPartial({
        borrower,
        market: marketPda,
        irm: market.irm,
        position: positionPda,
        loanVault: loanVaultPda,
        receiverLoanAta,
        collateralOracle,
        loanOracle,
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
}
