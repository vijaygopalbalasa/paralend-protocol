// Use the string for server components; create PublicKey in client code as needed
export const PROGRAM_ID = "BDZo1obAjSPufJsRqJmBy82whgQfedDXnTDipdA2nCVn";
export const NETWORK = "devnet";
export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

// Protocol constants (mirrors programs/nucleus/src/constants.rs)
export const WAD = BigInt("1000000000000000000"); // 1e18
export const BPS = 10_000n;
export const VIRTUAL_SHARES = 1_000_000n;
export const VIRTUAL_ASSETS = 1n;
export const MAX_FEE_BPS = 2_500; // 25%
export const FLASH_LOAN_FEE_BPS = 5; // 0.05%
export const SECONDS_PER_YEAR = BigInt(31_536_000);

// Common LLTV presets (in BPS, i.e. 8600 = 86%)
export const LLTV_PRESETS = [
  { label: "Conservative", lltv: 65, description: "65% — low-risk collateral" },
  { label: "Standard", lltv: 80, description: "80% — blue-chip tokens" },
  { label: "Aggressive", lltv: 86, description: "86% — high-quality LSTs" },
  { label: "Max", lltv: 91, description: "91% — stablecoin pairs" },
] as const;

// Token display metadata (for UI only)
export const TOKEN_META: Record<string, { symbol: string; icon: string; name: string }> = {
  SOL: { symbol: "SOL", icon: "◎", name: "Solana" },
  USDC: { symbol: "USDC", icon: "$", name: "USD Coin" },
  jitoSOL: { symbol: "jitoSOL", icon: "⚡", name: "Jito Staked SOL" },
  JUP: { symbol: "JUP", icon: "♃", name: "Jupiter" },
  mSOL: { symbol: "mSOL", icon: "◈", name: "Marinade Staked SOL" },
  BONK: { symbol: "BONK", icon: "🐕", name: "Bonk" },
};

// Demo market data for UI development
// TODO: replace with live chain data via NucleusClient
export const DEMO_MARKETS = [
  {
    id: "sol-usdc",
    collateral: "SOL",
    loan: "USDC",
    lltv: 86,
    supplyApy: 4.2,
    borrowApy: 5.8,
    tvl: 850_000,
    utilization: 72,
    totalSupplied: 850_000,
    totalBorrowed: 612_000,
    oracle: "Pyth SOL/USD",
  },
  {
    id: "jitosol-usdc",
    collateral: "jitoSOL",
    loan: "USDC",
    lltv: 86,
    supplyApy: 3.8,
    borrowApy: 5.1,
    tvl: 1_200_000,
    utilization: 74,
    totalSupplied: 1_200_000,
    totalBorrowed: 888_000,
    oracle: "Pyth jitoSOL/USD",
  },
  {
    id: "jup-usdc",
    collateral: "JUP",
    loan: "USDC",
    lltv: 75,
    supplyApy: 8.1,
    borrowApy: 11.2,
    tvl: 320_000,
    utilization: 71,
    totalSupplied: 320_000,
    totalBorrowed: 227_200,
    oracle: "Pyth JUP/USD",
  },
] as const;

export type DemoMarket = (typeof DEMO_MARKETS)[number];

// Demo positions for UI development
// TODO: replace with live chain data via NucleusClient
export const DEMO_POSITIONS = [
  {
    marketId: "sol-usdc",
    collateral: "SOL",
    loan: "USDC",
    suppliedShares: 5_000_000_000n, // raw shares
    suppliedAssets: 5_000, // display USD
    borrowedShares: 2_000_000_000n,
    borrowedAssets: 3_000, // display USD
    collateralAmount: 50, // SOL
    collateralValueUsd: 9_500,
    healthFactor: 1.82,
  },
] as const;
