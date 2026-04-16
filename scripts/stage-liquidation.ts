// scripts/stage-liquidation.ts — STUB
//
// Nucleus era: manually staged an unhealthy position by dropping the
// StaticOracle collateral price. Paralend's equivalent is to advance a
// market toward its `resolution_timestamp` (or attest a price that
// legitimately crosses the time-decay LLTV), then trigger
// `force_close_position`.
//
// Stubbed to keep `tsc --noEmit` green during the Day 4 oracle migration.
// Proper replacement shipped on Day 20 alongside the demo deployment
// scripts.

export {};

async function main(): Promise<void> {
  // TODO(day-20): Stage a near-resolution position for force-close demo:
  //   - Register or reuse a Kalshi-like market with short resolution window
  //   - Supply USDC liquidity, post YES collateral, borrow
  //   - Attest a price that puts position under effective LLTV
  //   - Surface the positionPda for the demo force-close video
  console.warn("[paralend-stage-liquidation] stub — implemented on Day 20");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
