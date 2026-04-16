"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DECAY_START_SECONDS,
  decayCurveSamples,
  resolutionPhase,
} from "@/lib/decay";
import { FORCE_CLOSE_WINDOW_SECONDS } from "@/lib/constants";

export interface DecayCurveChartProps {
  /** base LLTV in BPS (e.g. 6000 for 60 %). */
  baseLltvBps: number;
  /** Unix seconds; 0 = classical lending (render nothing). */
  resolutionTimestamp: number;
  marketStatus: number;
  width?: number;
  height?: number;
}

/**
 * Pure-SVG renderer for the time-decay LLTV curve. No Recharts dep — keeps
 * the bundle small and the render deterministic for screenshots in the
 * submission demo. X-axis spans [now, resolution]; Y-axis spans [0, 100%].
 * Red zone = force-close window. Grey dashed line = 7-day decay onset.
 */
export function DecayCurveChart({
  baseLltvBps,
  resolutionTimestamp,
  marketStatus,
  width = 560,
  height = 220,
}: DecayCurveChartProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5_000);
    return () => clearInterval(id);
  }, []);

  const samples = useMemo(
    () =>
      decayCurveSamples({
        baseLltvBps,
        resolutionTimestampSec: resolutionTimestamp,
        nowSec: now,
        samples: 72,
      }),
    [baseLltvBps, resolutionTimestamp, now]
  );

  if (resolutionTimestamp === 0 || samples.length === 0) {
    return (
      <div className="rounded-xl border border-paralend-border border-dashed bg-paralend-card p-6 text-center">
        <p className="text-sm font-medium text-paralend-text-secondary">
          No scheduled resolution — this market behaves as a classical
          lending market (no time-decay).
        </p>
      </div>
    );
  }

  const pad = { top: 18, right: 20, bottom: 36, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const tMin = samples[0].t;
  const tMax = samples[samples.length - 1].t;
  const span = Math.max(1, tMax - tMin);

  const xFor = (t: number) => pad.left + ((t - tMin) / span) * plotW;
  const yFor = (pct: number) =>
    pad.top + plotH - (Math.min(100, pct) / 100) * plotH;

  const linePath = samples
    .map(({ t, lltvPct }, i) => `${i === 0 ? "M" : "L"}${xFor(t)},${yFor(lltvPct)}`)
    .join(" ");

  const areaPath =
    linePath +
    ` L${xFor(tMax)},${pad.top + plotH}` +
    ` L${xFor(tMin)},${pad.top + plotH} Z`;

  // Decay-onset marker: the point where effective LLTV first drops below base,
  // i.e. remaining = DECAY_START_SECONDS.
  const decayOnsetT = tMax - DECAY_START_SECONDS;
  const decayOnsetVisible = decayOnsetT >= tMin && decayOnsetT <= tMax;

  // Force-close zone: [tMax - FORCE_CLOSE_WINDOW, tMax]
  const fcStart = Math.max(tMin, tMax - FORCE_CLOSE_WINDOW_SECONDS);
  const fcX = xFor(fcStart);
  const fcW = xFor(tMax) - fcX;

  const phase = resolutionPhase(resolutionTimestamp, marketStatus, now);

  const yGrid = [0, 25, 50, 75, 100];

  return (
    <div className="rounded-xl border border-paralend-border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-wider text-paralend-text-secondary">
          Effective LLTV until resolution
        </h3>
        <span className="text-xs font-bold text-paralend-text-secondary tabular-nums">
          base {(baseLltvBps / 100).toFixed(1)}%
        </span>
      </div>

      <svg
        role="img"
        aria-label="Time-decay LLTV curve"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
      >
        {/* Y grid */}
        {yGrid.map((g) => (
          <g key={g}>
            <line
              x1={pad.left}
              x2={pad.left + plotW}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="#E5E5E5"
              strokeDasharray="3 3"
            />
            <text
              x={pad.left - 6}
              y={yFor(g) + 3}
              fontSize={10}
              textAnchor="end"
              fill="#888"
            >
              {g}%
            </text>
          </g>
        ))}

        {/* Force-close zone */}
        {fcW > 0 && (
          <rect
            x={fcX}
            y={pad.top}
            width={fcW}
            height={plotH}
            fill="#F59E0B"
            fillOpacity={0.08}
          />
        )}

        {/* Area under curve */}
        <path d={areaPath} fill="#111111" fillOpacity={0.05} />

        {/* Curve line */}
        <path
          d={linePath}
          stroke="#111111"
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Decay onset marker (dashed vertical) */}
        {decayOnsetVisible && (
          <g>
            <line
              x1={xFor(decayOnsetT)}
              x2={xFor(decayOnsetT)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke="#888"
              strokeDasharray="4 3"
            />
            <text
              x={xFor(decayOnsetT) + 4}
              y={pad.top + 10}
              fontSize={10}
              fill="#888"
            >
              T-7d · decay begins
            </text>
          </g>
        )}

        {/* Now marker (green dot) */}
        <circle cx={xFor(tMin)} cy={yFor(samples[0].lltvPct)} r={4} fill="#16A34A" />
        <text
          x={xFor(tMin) + 6}
          y={yFor(samples[0].lltvPct) - 6}
          fontSize={10}
          fill="#16A34A"
          fontWeight={700}
        >
          now · {samples[0].lltvPct.toFixed(1)}%
        </text>

        {/* Resolution marker */}
        <line
          x1={xFor(tMax)}
          x2={xFor(tMax)}
          y1={pad.top}
          y2={pad.top + plotH}
          stroke="#EF4444"
          strokeWidth={1.5}
        />

        {/* X-axis labels */}
        <text x={pad.left} y={height - 12} fontSize={10} fill="#888">
          {samples[0].label}
        </text>
        <text
          x={pad.left + plotW}
          y={height - 12}
          fontSize={10}
          fill="#888"
          textAnchor="end"
        >
          resolution
        </text>
      </svg>

      <p className="mt-2 text-[11px] font-medium text-paralend-text-secondary">
        Effective LLTV ramps down over the final 7 days before resolution.
        The shaded strip marks the {Math.floor(FORCE_CLOSE_WINDOW_SECONDS / 3600)}-hour
        force-close window (currently <strong>{phase}</strong>).
      </p>
    </div>
  );
}
