// app/src/app/create/page.tsx -- admin-only market registration.
//
// Paralend markets are registered by the protocol operator via
// scripts/setup-devnet-markets.ts (requires the owner keypair + a Kalshi
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
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10">
      <div className="border-b border-border pb-5">
        <div className="eyebrow-xs mb-2">Operator</div>
        <h1 className="text-[30px] font-extrabold leading-tight text-ink">
          Market registration
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink2">
          Market creation is handled by operator scripts. Event markets require
          a resolution timestamp, an authorized price attester, and seeded price
          cache state before users interact with them.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-bold text-ink">
          For operators
        </h2>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-xs text-ink">
{`# from the repo root
anchor deploy --provider.cluster devnet

npx ts-node --project tsconfig.json \\
  scripts/setup-devnet-markets.ts --cluster=devnet

# ... then seed liquidity and attestations:
npx ts-node --project tsconfig.json \\
  scripts/fund-devnet.ts --cluster=devnet

npx ts-node --project tsconfig.json \\
  scripts/attester.ts --cluster=devnet --interval=20`}
        </pre>
        <p className="mt-3 text-xs text-ink3">
          The setup script reads the 3 flagship markets from{" "}
          <code className="font-mono">scripts/devnet-common.ts</code> —
          replace them with your Kalshi tickers + resolution epochs before
          running. Full runbook in{" "}
          <code className="font-mono">DEPLOYMENT.md</code>.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold text-ink">
          For users
        </h2>
        <p className="text-sm text-ink2">
          Use the markets screen to review active pools and open positions.
          New market registration is not exposed in the public interface.
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
