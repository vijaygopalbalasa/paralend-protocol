// app/src/app/create/page.tsx — admin-only landing.
//
// Paralend markets are registered by the protocol operator via
// scripts/setup-demo-markets.ts (requires the owner keypair + a Kalshi
// ticker + resolution timestamp). There is no free-form public
// market-creation flow — event markets need vetted resolution data,
// attester assignment, and seeded PriceCache liquidity that the
// browser cannot provide. This page used to expose a generic
// "create any market" form from the Nucleus era; it was removed from
// the public nav during the pivot and replaced with the operator
// instructions below so judges / curious visitors who hit the URL get
// a clear answer instead of a broken form.

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: "Paralend — Market Registration (admin)",
};

export default function CreateMarketPage() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-paralend-text-primary">
          Market registration is admin-only
        </h1>
        <p className="mt-2 text-sm text-paralend-text-secondary">
          Paralend markets need three things that can't come from the
          browser: a resolution timestamp sourced from Kalshi, an attester
          keypair authorised to push prices, and a seeded price cache. All
          three are wired up by the setup script that the protocol operator
          runs against devnet or mainnet.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-black text-paralend-text-primary mb-3">
          For operators
        </h2>
        <pre className="text-xs font-mono bg-paralend-card border border-paralend-border rounded-lg p-4 overflow-x-auto">
{`# from the repo root
anchor deploy --provider.cluster devnet

npx ts-node --project tsconfig.json \\
  scripts/setup-demo-markets.ts --cluster=devnet

# ... then seed liquidity and attestations:
npx ts-node --project tsconfig.json \\
  scripts/fund-demo.ts --cluster=devnet

npx ts-node --project tsconfig.json \\
  scripts/attester.ts --cluster=devnet --interval=20`}
        </pre>
        <p className="mt-3 text-xs text-paralend-text-secondary">
          The setup script reads the 3 flagship markets from{" "}
          <code className="font-mono">scripts/demo-common.ts</code> —
          replace them with your Kalshi tickers + resolution epochs before
          running. Full runbook in{" "}
          <code className="font-mono">DEPLOYMENT.md</code>.
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-black text-paralend-text-primary mb-3">
          For users
        </h2>
        <p className="text-sm text-paralend-text-secondary">
          Nothing to do here — browse the active markets, deposit YES/NO
          tokens as collateral, borrow USDC. The protocol operator handles
          the rest.
        </p>
        <div className="mt-4">
          <Link href="/markets">
            <Button variant="primary" size="md">
              Browse markets
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
