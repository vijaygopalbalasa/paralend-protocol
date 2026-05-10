import { NextResponse } from "next/server";

import { getLiveDflowMarketMeta } from "@/lib/live-market-meta";

export const revalidate = 20;

export async function GET(
  _request: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const market = await getLiveDflowMarketMeta(ticker).catch(() => null);
  if (!market) {
    return NextResponse.json({ ok: false, market: null });
  }
  return NextResponse.json({ ok: true, market });
}
