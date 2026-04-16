// Use the string for server components; create PublicKey in client code as needed
export const PROGRAM_ID =
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
  "2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8";
export const NETWORK = "devnet";
export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

// Protocol constants (mirrors programs/paralend/src/constants.rs)
export const WAD = BigInt("1000000000000000000"); // 1e18
export const BPS = 10_000n;
export const VIRTUAL_SHARES = 1_000_000n;
export const VIRTUAL_ASSETS = 1n;
export const MAX_FEE_BPS = 2_500; // 25%
export const SECONDS_PER_YEAR = BigInt(31_536_000);

// Paralend — prediction-market credit specifics
export const MAX_BINARY_LLTV = 7_000; // 70% cap
export const FORCE_CLOSE_WINDOW_SECONDS = 7_200; // 2h pre-resolution
export const POST_BORROW_CUTOFF_SECONDS = 1_800; // 30min pre-resolution

// Common LLTV presets (in BPS, i.e. 8600 = 86%)
export const LLTV_PRESETS = [
  { label: "Conservative", lltv: 65, description: "65% — low-risk collateral" },
  { label: "Standard", lltv: 80, description: "80% — blue-chip tokens" },
  { label: "Aggressive", lltv: 86, description: "86% — high-quality LSTs" },
  { label: "Max", lltv: 91, description: "91% — stablecoin pairs" },
] as const;

// Token display metadata (for UI only)
// Keys are mint addresses OR well-known symbols for fallback matching
export const TOKEN_META: Record<string, { symbol: string; icon: string; name: string }> = {
  // Well-known symbols (fallback when mint not found)
  SOL: { symbol: "SOL", icon: "◎", name: "Solana" },
  wSOL: { symbol: "wSOL", icon: "◎", name: "Wrapped SOL" },
  USDC: { symbol: "USDC", icon: "$", name: "USD Coin" },
  jitoSOL: { symbol: "jitoSOL", icon: "⚡", name: "Jito Staked SOL" },
  JUP: { symbol: "JUP", icon: "♃", name: "Jupiter" },
  mSOL: { symbol: "mSOL", icon: "◈", name: "Marinade Staked SOL" },
  BONK: { symbol: "BONK", icon: "🐕", name: "Bonk" },
  // Devnet wrapped SOL (from spl-token create-token)
  So11111111111111111111111111111111111111112: { symbol: "wSOL", icon: "◎", name: "Wrapped SOL" },
};
