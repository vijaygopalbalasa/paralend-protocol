import rawConfig from "./market-registry.json";
import { formatAddress } from "./utils";
import { TOKEN_META } from "./constants";

export interface RegistryTokenConfig {
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
  /** Real DFlow/Kalshi outcome mint represented by a devnet outcome mint, when applicable. */
  sourceMint?: string;
  oracleFeedId?: string;
}

export interface RegistryMarketConfig {
  name: string;
  /** Kalshi ticker (UTF-8, decoded from on-chain bytes). */
  kalshiTicker?: string;
  /** Unix seconds when the PM resolves. 0 = classical lending market. */
  resolutionTimestamp?: number;
  marketId: string;
  collateralMint: string;
  /** Real DFlow/Kalshi outcome mint represented by `collateralMint` on devnet. */
  sourceCollateralMint?: string;
  loanMint: string;
  collateralSymbol: string;
  loanSymbol: string;
  oracle: string;
  lltv: number;
  feeBps: number;
  irm: string;
  /** PriceCache PDA (per-market oracle). Optional for backwards compat. */
  priceCache?: string;
  collateralOracleFeedId?: string;
  loanOracleFeedId?: string;
  // Legacy Nucleus-era fields kept optional so re-seeded registry entries
  // (which no longer populate them) don't crash type checks.
  collateralOracle?: string;
  loanOracle?: string;
}

export interface MarketRegistry {
  cluster: string;
  programId: string;
  generatedAt: string;
  attester?: string;
  primaryWallet?: string;
  liquidationTarget?: string;
  tokens: Record<string, RegistryTokenConfig>;
  markets: Record<string, RegistryMarketConfig>;
}

export const MARKET_REGISTRY = rawConfig as MarketRegistry;

export function getRegistryToken(mint: string): RegistryTokenConfig | null {
  return MARKET_REGISTRY.tokens[mint] ?? null;
}

export function getRegistryMarket(address: string): RegistryMarketConfig | null {
  return MARKET_REGISTRY.markets[address] ?? null;
}

/**
 * Resolve token symbol from mint address.
 * Priority: market-registry.json → TOKEN_META (by mint) → truncated address
 */
export function resolveTokenSymbol(mint: string): string {
  // 1. Check market-registry.json (populated by setup scripts)
  const registryToken = getRegistryToken(mint);
  if (registryToken?.symbol) return registryToken.symbol;

  // 2. Check TOKEN_META by mint address
  const knownToken = TOKEN_META[mint];
  if (knownToken?.symbol) return knownToken.symbol;

  // 3. Fallback to formatted address
  return formatAddress(mint);
}

/**
 * Resolve token icon from mint address.
 * Priority: market-registry.json → TOKEN_META (by mint) → generic token icon
 */
export function resolveTokenIcon(mint: string): string {
  // 1. Check market-registry.json
  const registryToken = getRegistryToken(mint);
  if (registryToken?.icon) return registryToken.icon;

  // 2. Check TOKEN_META by mint address
  const knownToken = TOKEN_META[mint];
  if (knownToken?.icon) return knownToken.icon;

  // 3. Fallback to generic token icon
  return "●";
}

/**
 * Resolve token name from mint address.
 * Priority: market-registry.json → TOKEN_META (by mint) → truncated address
 */
export function resolveTokenName(mint: string): string {
  // 1. Check market-registry.json
  const registryToken = getRegistryToken(mint);
  if (registryToken?.name) return registryToken.name;

  // 2. Check TOKEN_META by mint address
  const knownToken = TOKEN_META[mint];
  if (knownToken?.name) return knownToken.name;

  // 3. Fallback to formatted address
  return formatAddress(mint);
}
