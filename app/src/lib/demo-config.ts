import rawConfig from "./demo-config.json";
import { formatAddress } from "./utils";
import { TOKEN_META } from "./constants";

export interface DemoTokenConfig {
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
  oracleFeedId?: string;
}

export interface DemoMarketConfig {
  name: string;
  /** Kalshi ticker (UTF-8, decoded from on-chain bytes). */
  kalshiTicker?: string;
  /** Unix seconds when the PM resolves. 0 = classical lending market. */
  resolutionTimestamp?: number;
  marketId: string;
  collateralMint: string;
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
  // Legacy Nucleus-era fields kept OPTIONAL so re-seeded demo configs
  // (which no longer populate them) don't crash type checks.
  collateralOracle?: string;
  loanOracle?: string;
}

export interface DemoConfig {
  cluster: string;
  programId: string;
  generatedAt: string;
  attester?: string;
  primaryWallet?: string;
  liquidationTarget?: string;
  tokens: Record<string, DemoTokenConfig>;
  markets: Record<string, DemoMarketConfig>;
}

export const DEMO_CONFIG = rawConfig as DemoConfig;

export function getDemoToken(mint: string): DemoTokenConfig | null {
  return DEMO_CONFIG.tokens[mint] ?? null;
}

export function getDemoMarket(address: string): DemoMarketConfig | null {
  return DEMO_CONFIG.markets[address] ?? null;
}

/**
 * Resolve token symbol from mint address.
 * Priority: demo-config.json → TOKEN_META (by mint) → truncated address
 */
export function resolveTokenSymbol(mint: string): string {
  // 1. Check demo-config.json (populated by setup scripts)
  const demoToken = getDemoToken(mint);
  if (demoToken?.symbol) return demoToken.symbol;

  // 2. Check TOKEN_META by mint address
  const knownToken = TOKEN_META[mint];
  if (knownToken?.symbol) return knownToken.symbol;

  // 3. Fallback to formatted address
  return formatAddress(mint);
}

/**
 * Resolve token icon from mint address.
 * Priority: demo-config.json → TOKEN_META (by mint) → generic token icon
 */
export function resolveTokenIcon(mint: string): string {
  // 1. Check demo-config.json
  const demoToken = getDemoToken(mint);
  if (demoToken?.icon) return demoToken.icon;

  // 2. Check TOKEN_META by mint address
  const knownToken = TOKEN_META[mint];
  if (knownToken?.icon) return knownToken.icon;

  // 3. Fallback to generic token icon
  return "●";
}

/**
 * Resolve token name from mint address.
 * Priority: demo-config.json → TOKEN_META (by mint) → truncated address
 */
export function resolveTokenName(mint: string): string {
  // 1. Check demo-config.json
  const demoToken = getDemoToken(mint);
  if (demoToken?.name) return demoToken.name;

  // 2. Check TOKEN_META by mint address
  const knownToken = TOKEN_META[mint];
  if (knownToken?.name) return knownToken.name;

  // 3. Fallback to formatted address
  return formatAddress(mint);
}
