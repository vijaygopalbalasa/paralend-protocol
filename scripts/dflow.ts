import { PublicKey } from "@solana/web3.js";

import {
  DevnetCluster,
  DevnetDeploymentEntry,
  DevnetMarketDefinition,
  ZERO_FEED_ID,
  priceToWad,
  resolveFeedId,
} from "./devnet-common";

const DEFAULT_METADATA_URL = "https://dev-prediction-markets-api.dflow.net";
const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CASH = "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH";

type OutcomeSide = "YES" | "NO";

interface DflowMarketAccount {
  marketLedger: string;
  yesMint: string;
  noMint: string;
  isInitialized: boolean;
  redemptionStatus: string | null;
}

interface DflowMarket {
  ticker: string;
  eventTicker: string;
  marketType: string;
  title: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  openTime: number;
  closeTime: number;
  expirationTime: number;
  status: string;
  result?: string;
  volume?: number;
  volume24h?: number;
  openInterest?: number;
  volumeFp?: string;
  volume24hFp?: string;
  openInterestFp?: string;
  yesBid?: string | null;
  yesAsk?: string | null;
  noBid?: string | null;
  noAsk?: string | null;
  accounts?: Record<string, DflowMarketAccount>;
}

interface DflowMarketsResponse {
  markets: DflowMarket[];
}

export interface DflowSpot {
  ticker: string;
  side: OutcomeSide;
  priceUsd: number;
  priceWad: bigint;
  bid: number;
  ask: number;
  spreadBps: number;
  source: "dflow";
  observedAt: string;
}

function metadataBaseUrl(): string {
  return (process.env.DFLOW_METADATA_URL ?? DEFAULT_METADATA_URL).replace(/\/$/, "");
}

function numberFrom(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function intEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${metadataBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`DFlow ${path} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function chooseInitializedAccount(market: DflowMarket): DflowMarketAccount | null {
  const accounts = market.accounts ?? {};
  const preferred =
    accounts[MAINNET_USDC] ??
    accounts[CASH] ??
    Object.values(accounts).find((account) => account.isInitialized) ??
    Object.values(accounts)[0];
  return preferred ?? null;
}

function sideQuote(market: DflowMarket, side: OutcomeSide) {
  const bid = numberFrom(side === "YES" ? market.yesBid : market.noBid);
  const ask = numberFrom(side === "YES" ? market.yesAsk : market.noAsk);
  if (bid <= 0 || ask <= 0 || ask < bid) return null;
  const mid = (bid + ask) / 2;
  const spreadBps = mid > 0 ? ((ask - bid) / mid) * 10_000 : Number.POSITIVE_INFINITY;
  return { bid, ask, spreadBps };
}

function lltvForCandidate(priceUsd: number, spreadBps: number, secondsToClose: number): bigint {
  let lltv = 6_000;
  if (priceUsd < 0.15 || priceUsd > 0.85) lltv -= 500;
  if (spreadBps > 800) lltv -= 500;
  if (secondsToClose < 14 * 24 * 3600) lltv -= 500;
  return BigInt(Math.max(4_500, lltv));
}

function safeKey(ticker: string, side: OutcomeSide): string {
  return `${ticker}-${side}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toDefinition(
  market: DflowMarket,
  side: OutcomeSide,
  nonce: bigint,
  nowSeconds: number
): DevnetMarketDefinition | null {
  const account = chooseInitializedAccount(market);
  const quote = sideQuote(market, side);
  if (!account || !account.isInitialized || !quote) return null;

  const sourceMint = side === "YES" ? account.yesMint : account.noMint;
  try {
    new PublicKey(sourceMint);
  } catch {
    return null;
  }

  const secondsToClose = Math.max(0, market.closeTime - nowSeconds);
  if (secondsToClose <= 0) return null;

  const sideLabel = side === "YES" ? market.yesSubTitle || "Yes" : market.noSubTitle || "No";
  const priceUsd = quote.bid;
  const feedKey = `dflow:${market.ticker}:${side}:${sourceMint}`;

  return {
    key: safeKey(market.ticker, side),
    name: `${market.title} (${side})`,
    kalshiTicker: market.ticker,
    sourceCollateralMint: sourceMint,
    sourceMarketLedger: account.marketLedger,
    sourceSettlementMint:
      Object.entries(market.accounts ?? {}).find(([, value]) => value === account)?.[0] ?? "",
    resolutionInSeconds: secondsToClose,
    collateralSymbol: side,
    collateralName: `${sideLabel} ${side}`,
    collateralIcon: side,
    collateralDecimals: 6,
    initialPriceUsd: priceUsd,
    loanSymbol: "USDC",
    loanName: "USD Coin (devnet)",
    loanIcon: "$",
    loanDecimals: 6,
    lltvBps: lltvForCandidate(priceUsd, quote.spreadBps, secondsToClose),
    irmNonce: nonce,
    baseRatePct: 0,
    slope1Pct: 5,
    slope2Pct: 230,
    kinkPct: 80,
    feeBps: 0n,
    collateralFeedId: resolveFeedId(feedKey),
    loanFeedId: ZERO_FEED_ID,
  };
}

export async function loadDflowMarketDefinitions(params: {
  cluster: DevnetCluster;
  count?: number;
}): Promise<DevnetMarketDefinition[]> {
  const count = params.count ?? intEnv("PARALEND_MARKET_COUNT", 3);
  const limit = intEnv("DFLOW_MARKET_LIMIT", Math.max(50, count * 20));
  const minSecondsToClose = intEnv("DFLOW_MIN_SECONDS_TO_CLOSE", 24 * 3600);
  const maxSpreadBps = intEnv("DFLOW_MAX_SPREAD_BPS", 1_500);
  const minOpenInterest = intEnv("DFLOW_MIN_OPEN_INTEREST", 1);
  const minPriceUsd = Number.parseFloat(process.env.DFLOW_MIN_PRICE_USD ?? "0.10");
  const maxPriceUsd = Number.parseFloat(process.env.DFLOW_MAX_PRICE_USD ?? "0.90");
  const nowSeconds = Math.floor(Date.now() / 1000);

  const data = await fetchJson<DflowMarketsResponse>(
    `/api/v1/markets?limit=${limit}&status=active`
  );

  const candidates = data.markets
    .filter((market) => market.marketType === "binary" && market.status === "active")
    .flatMap((market) => {
      const openInterest = numberFrom(market.openInterestFp ?? market.openInterest);
      const secondsToClose = market.closeTime - nowSeconds;
      if (openInterest < minOpenInterest || secondsToClose < minSecondsToClose) {
        return [];
      }
      return (["YES", "NO"] as OutcomeSide[]).flatMap((side) => {
        const quote = sideQuote(market, side);
        if (!quote || quote.spreadBps > maxSpreadBps) return [];
        if (quote.bid < minPriceUsd || quote.bid > maxPriceUsd) return [];
        return [{ market, side, quote, score: openInterest + numberFrom(market.volume24hFp ?? market.volume24h) }];
      });
    })
    .sort((a, b) => b.score - a.score);

  const definitions: DevnetMarketDefinition[] = [];
  const seenTickers = new Set<string>();
  for (const candidate of candidates) {
    if (definitions.length >= count) break;
    if (seenTickers.has(candidate.market.ticker)) continue;
    const definition = toDefinition(
      candidate.market,
      candidate.side,
      BigInt(definitions.length),
      nowSeconds
    );
    if (!definition) continue;
    definitions.push(definition);
    seenTickers.add(candidate.market.ticker);
  }

  if (definitions.length === 0) {
    throw new Error(
      "No DFlow markets passed the live-market filters. Relax DFLOW_MIN_SECONDS_TO_CLOSE, DFLOW_MAX_SPREAD_BPS, or DFLOW_MIN_OPEN_INTEREST."
    );
  }

  if (params.cluster !== "localnet") {
    console.log(
      `   Loaded ${definitions.length} live DFlow market${definitions.length === 1 ? "" : "s"} for devnet market setup.`
    );
  }
  return definitions;
}

export async function fetchDflowSpot(entry: DevnetDeploymentEntry): Promise<DflowSpot> {
  const side = entry.collateralSymbol.toUpperCase() === "NO" ? "NO" : "YES";
  const market = await fetchJson<DflowMarket>(
    `/api/v1/market/${encodeURIComponent(entry.kalshiTicker)}`
  );
  if (market.status !== "active") {
    throw new Error(`${entry.kalshiTicker} is ${market.status}; refusing to attest`);
  }
  const quote = sideQuote(market, side);
  if (!quote) {
    throw new Error(`${entry.kalshiTicker} ${side} has no executable bid/ask`);
  }
  const maxSpreadBps = intEnv("DFLOW_MAX_SPREAD_BPS", 1_500);
  if (quote.spreadBps > maxSpreadBps) {
    throw new Error(
      `${entry.kalshiTicker} ${side} spread ${quote.spreadBps.toFixed(0)} bps exceeds ${maxSpreadBps} bps`
    );
  }

  const priceUsd = quote.bid;
  return {
    ticker: market.ticker,
    side,
    priceUsd,
    priceWad: priceToWad(priceUsd, entry.collateralDecimals),
    bid: quote.bid,
    ask: quote.ask,
    spreadBps: quote.spreadBps,
    source: "dflow",
    observedAt: new Date().toISOString(),
  };
}
