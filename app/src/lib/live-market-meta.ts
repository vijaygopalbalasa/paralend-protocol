export interface LiveDflowMarketMeta {
  ticker: string;
  title: string;
  status: string;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  observedAt: string;
}

interface DflowMarketResponse {
  ticker?: string;
  title?: string;
  status?: string;
  yesBid?: string | number | null;
  yesAsk?: string | number | null;
  noBid?: string | number | null;
  noAsk?: string | number | null;
}

function metadataBaseUrl(): string {
  return (
    process.env.DFLOW_METADATA_URL ??
    "https://dev-prediction-markets-api.dflow.net"
  ).replace(/\/$/, "");
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function getLiveDflowMarketMeta(
  ticker: string
): Promise<LiveDflowMarketMeta | null> {
  if (!ticker) return null;

  const response = await fetch(
    `${metadataBaseUrl()}/api/v1/market/${encodeURIComponent(ticker)}`,
    { next: { revalidate: 20 } }
  );
  if (!response.ok) return null;

  const market = (await response.json()) as DflowMarketResponse;
  if (!market.ticker || !market.title) return null;

  return {
    ticker: market.ticker,
    title: market.title,
    status: market.status ?? "unknown",
    yesBid: numberOrNull(market.yesBid),
    yesAsk: numberOrNull(market.yesAsk),
    noBid: numberOrNull(market.noBid),
    noAsk: numberOrNull(market.noAsk),
    observedAt: new Date().toISOString(),
  };
}

export function liveDflowDisplayName(
  meta: LiveDflowMarketMeta | null,
  side = "YES"
): string | null {
  if (!meta?.title) return null;
  return `${meta.title} (${side.toUpperCase() === "NO" ? "NO" : "YES"})`;
}
