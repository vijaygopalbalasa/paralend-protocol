import type { LiveDflowMarketMeta } from "./live-market-meta";

const metaCache = new Map<
  string,
  { value: LiveDflowMarketMeta | null; ts: number }
>();
const TTL_MS = 20_000;

export async function fetchLiveDflowMarketMeta(
  ticker: string
): Promise<LiveDflowMarketMeta | null> {
  if (!ticker) return null;
  const cached = metaCache.get(ticker);
  const now = Date.now();
  if (cached && now - cached.ts < TTL_MS) return cached.value;

  try {
    const response = await fetch(
      `/api/dflow-market/${encodeURIComponent(ticker)}`,
      {
        cache: "no-store",
      }
    );
    if (!response.ok) {
      metaCache.set(ticker, { value: null, ts: now });
      return null;
    }
    const body = (await response.json()) as {
      ok: boolean;
      market?: LiveDflowMarketMeta;
    };
    const value = body.ok ? body.market ?? null : null;
    metaCache.set(ticker, { value, ts: now });
    return value;
  } catch {
    metaCache.set(ticker, { value: null, ts: now });
    return null;
  }
}

export function liveDflowDisplayName(
  meta: LiveDflowMarketMeta | null,
  side = "YES"
): string | null {
  if (!meta?.title) return null;
  return `${meta.title} (${side.toUpperCase() === "NO" ? "NO" : "YES"})`;
}
