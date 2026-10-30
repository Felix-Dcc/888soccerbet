"use client";
import { useState } from "react";

export interface TrendPoint {
  bucket: string; // YYYY-MM-DD
  registrations: number;
  deposits: number; // GHS
  withdrawals: number;
  stakes: number;
  ggr: number; // can be negative
}

const VIEWS = {
  money: { label: "Deposits & withdrawals", series: [{ key: "deposits", name: "Deposits", color: "rgb(var(--lime))" }, { key: "withdrawals", name: "Withdrawals", color: "rgb(var(--warn))" }], money: true },
  betting: { label: "Stakes & GGR", series: [{ key: "stakes", name: "Stakes placed", color: "rgb(var(--lime))" }, { key: "ggr", name: "GGR", color: "rgb(var(--teal))" }], money: true },
  players: { label: "Registrations", series: [{ key: "registrations", name: "New players", color: "rgb(var(--lime))" }], money: false },
} as const;
type View = keyof typeof VIEWS;

const fmt = (v: number, money: boolean) =>
  money ? `GHS ${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v.toLocaleString("en-GB");
const short = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k` : v.toLocaleString("en-GB", { maximumFractionDigits: 0 }));
const label = (b: string) => new Date(`${b}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function nice(v: number) {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Trend lines over the selected range, with view tabs, hover readout and a text alternative. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [view, setView] = useState<View>("betting");
  const [hover, setHover] = useState<number | null>(null);
  const v = VIEWS[view];
  const W = 760;
  const H = 260;
  const M = { t: 14, r: 14, b: 30, l: 52 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const vals = points.flatMap((p) => v.series.map((s) => p[s.key]));
  const hi = nice(Math.max(0, ...vals)) || 10;
  const lo = -nice(Math.max(0, ...vals.map((x) => -x)));
  const x = (i: number) => M.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (val: number) => M.t + ((hi - val) / (hi - lo)) * ih;
  const ticks = [lo, ...(lo < 0 ? [0] : []), (hi + Math.max(lo, 0)) / 2, hi].filter((t, i, a) => a.indexOf(t) === i);
  const every = Math.max(1, Math.ceil(points.length / 8));
  const h = hover === null ? null : points[hover];
  const empty = vals.every((x) => x === 0);

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Chart" className="flex flex-wrap gap-1 rounded-lg bg-ink-600 p-1">
          {(Object.keys(VIEWS) as View[]).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={view === k}
              onClick={() => setView(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === k ? "bg-ink-700 text-white shadow-card" : "text-fog hover:text-white"}`}
            >
              {VIEWS[k].label}
            </button>
          ))}
        </div>
        <div className="flex gap-4 text-xs text-fog">
          {v.series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${v.label} over the selected period`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="currentColor" className={t === 0 ? "text-fog-muted" : "text-line"} strokeWidth={1} />
              <text x={M.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-fog text-[11px] tabular-nums">
                {short(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % every === 0 ? (
              <text key={p.bucket} x={x(i)} y={H - 8} textAnchor="middle" className="fill-fog text-[11px]">
                {label(p.bucket)}
              </text>
            ) : null,
          )}
          {h && <line x1={x(hover!)} x2={x(hover!)} y1={M.t} y2={M.t + ih} stroke="currentColor" className="text-fog-muted" strokeDasharray="3 3" />}
          {v.series.map((s) => (
            <path
              key={s.key}
              d={points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {h && v.series.map((s) => <circle key={s.key} cx={x(hover!)} cy={y(h[s.key])} r={4.5} fill={s.color} stroke="white" strokeWidth={2} />)}
          {points.map((p, i) => (
            <rect key={p.bucket} x={x(i) - iw / Math.max(points.length, 1) / 2} y={M.t} width={iw / Math.max(points.length, 1)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-line bg-ink-700 px-3 py-2 text-xs shadow-lift"
            style={{ left: `${(x(hover!) / W) * 100}%`, transform: `translateX(${hover! > points.length / 2 ? "-105%" : "5%"})` }}
          >
            <div className="mb-1 font-semibold text-white">{label(h.bucket)}</div>
            {v.series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-fog">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
                <span className="ml-auto pl-3 font-semibold tabular-nums text-white">{fmt(h[s.key], v.money)}</span>
              </div>
            ))}
          </div>
        )}
        {empty && <p className="absolute inset-0 grid place-items-center text-sm text-fog">Nothing in this period</p>}
      </div>
      <figcaption className="sr-only">{points.map((p) => `${label(p.bucket)}: ${v.series.map((s) => `${s.name} ${fmt(p[s.key], v.money)}`).join(", ")}`).join("; ")}</figcaption>
    </figure>
  );
}
