"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DECAY_START_SECONDS,
  decayCurveSamples,
  resolutionPhase,
} from "@/lib/decay";
import { FORCE_CLOSE_WINDOW_SECONDS } from "@/lib/constants";

export interface DecayCurveChartProps {
  baseLltvBps: number;
  resolutionTimestamp: number;
  marketStatus: number;
  width?: number;
  height?: number;
  thumbnail?: boolean;
}

/**
 * Soft consumer chart — coral fill that turns crimson in last call.
 * Smooth curve, no hatching, no glow, no neon.
 */
export function DecayCurveChart({
  baseLltvBps,
  resolutionTimestamp,
  marketStatus,
  width = 720,
  height = 240,
  thumbnail = false,
}: DecayCurveChartProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5_000);
    return () => clearInterval(id);
  }, []);

  const nowForChart = now ?? 0;

  const samples = useMemo(
    () =>
      decayCurveSamples({
        baseLltvBps,
        resolutionTimestampSec: resolutionTimestamp,
        nowSec: nowForChart,
        samples: 72,
      }),
    [baseLltvBps, resolutionTimestamp, nowForChart]
  );

  if (now === null) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        <line
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="#7A766E"
          strokeOpacity={0.22}
          strokeWidth={thumbnail ? 2 : 1.5}
          strokeDasharray="6 6"
        />
      </svg>
    );
  }

  if (resolutionTimestamp === 0 || samples.length === 0) {
    if (thumbnail) {
      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="#7A766E" strokeOpacity={0.4} strokeWidth={2} strokeDasharray="6 6" />
        </svg>
      );
    }
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center">
        <p className="text-sm text-ink3">This market never expires — borrow power stays flat.</p>
      </div>
    );
  }

  const pad = thumbnail
    ? { top: 4, right: 4, bottom: 4, left: 4 }
    : { top: 24, right: 24, bottom: 38, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const tMin = samples[0].t;
  const tMax = samples[samples.length - 1].t;
  const span = Math.max(1, tMax - tMin);

  const xFor = (t: number) => pad.left + ((t - tMin) / span) * plotW;
  const yFor = (pct: number) =>
    pad.top + plotH - (Math.min(100, pct) / 100) * plotH;

  const linePath = samples
    .map(({ t, lltvPct }, i) => `${i === 0 ? "M" : "L"}${xFor(t).toFixed(2)},${yFor(lltvPct).toFixed(2)}`)
    .join(" ");

  const areaPath =
    linePath +
    ` L${xFor(tMax).toFixed(2)},${(pad.top + plotH).toFixed(2)}` +
    ` L${xFor(tMin).toFixed(2)},${(pad.top + plotH).toFixed(2)} Z`;

  const decayOnsetT = tMax - DECAY_START_SECONDS;
  const decayOnsetVisible = decayOnsetT >= tMin && decayOnsetT <= tMax;

  const fcStart = Math.max(tMin, tMax - FORCE_CLOSE_WINDOW_SECONDS);
  const fcX = xFor(fcStart);
  const fcW = xFor(tMax) - fcX;

  const phase = resolutionPhase(resolutionTimestamp, marketStatus, now);
  const isLastCall = phase === "cutoff" || phase === "force-close-window";

  const stroke = isLastCall ? "#E53056" : "#FF5436";
  const fill = isLastCall ? "#E53056" : "#FF5436";
  const fillOpacity = isLastCall ? 0.16 : 0.14;

  if (thumbnail) {
    const gradId = `g-${Math.abs(resolutionTimestamp)}-thumb`;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity={fillOpacity * 1.4} />
            <stop offset="100%" stopColor={fill} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const yGrid = [0, 25, 50, 75, 100];
  const gradId = `g-${Math.abs(resolutionTimestamp)}-full`;

  return (
    <div className="relative">
      <svg role="img" aria-label="Borrow power vs time" viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity={fillOpacity * 1.6} />
            <stop offset="100%" stopColor={fill} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yGrid.map((g) => (
          <g key={g}>
            <line x1={pad.left} x2={pad.left + plotW} y1={yFor(g)} y2={yFor(g)} stroke="#0F0E0D" strokeOpacity={0.06} />
            <text x={pad.left - 10} y={yFor(g) + 4} fontSize={10} textAnchor="end" fill="#7A766E" fontFamily="'JetBrains Mono', monospace" style={{ letterSpacing: "0.04em" }}>
              {g}
            </text>
          </g>
        ))}

        {fcW > 0 && (
          <>
            <rect x={fcX} y={pad.top} width={fcW} height={plotH} fill="#E53056" fillOpacity={0.06} rx={6} />
            <text x={fcX + fcW / 2} y={pad.top + 14} fontSize={9} fill="#E53056" textAnchor="middle" fontWeight={700} fontFamily="'Manrope', sans-serif" style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Last call
            </text>
          </>
        )}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          stroke={stroke}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {decayOnsetVisible && (
          <g>
            <line x1={xFor(decayOnsetT)} x2={xFor(decayOnsetT)} y1={pad.top} y2={pad.top + plotH} stroke="#0F0E0D" strokeOpacity={0.18} strokeDasharray="3 4" />
            <text x={xFor(decayOnsetT) + 6} y={pad.top + 14} fontSize={9} fill="#7A766E" fontFamily="'Manrope', sans-serif" fontWeight={600} style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>
              7d
            </text>
          </g>
        )}

        {/* NOW marker */}
        <circle cx={xFor(tMin)} cy={yFor(samples[0].lltvPct)} r={6} fill={stroke} />
        <circle cx={xFor(tMin)} cy={yFor(samples[0].lltvPct)} r={3} fill="white" />
        <text x={xFor(tMin) + 12} y={yFor(samples[0].lltvPct) - 8} fontSize={10} fill={stroke} fontWeight={700} fontFamily="'Manrope', sans-serif" style={{ letterSpacing: "0.06em" }}>
          NOW · {samples[0].lltvPct.toFixed(0)}%
        </text>

        <line x1={xFor(tMax)} x2={xFor(tMax)} y1={pad.top} y2={pad.top + plotH} stroke="#0F0E0D" strokeOpacity={0.4} strokeWidth={1} />

        <text x={pad.left} y={height - 14} fontSize={10} fill="#7A766E" fontFamily="'Manrope', sans-serif" fontWeight={600} style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Now
        </text>
        <text x={pad.left + plotW} y={height - 14} fontSize={10} fill="#7A766E" textAnchor="end" fontFamily="'Manrope', sans-serif" fontWeight={600} style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Settles
        </text>
      </svg>
    </div>
  );
}
