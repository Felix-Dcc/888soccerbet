import Link from "next/link";
import type { Metrics } from "@/lib/adminAnalytics";
import type { Alert } from "@/lib/systemHealth";
import { Delta, Light, Spark, ghs } from "./kit";

const pctOf = (a: bigint, b: bigint) => (b === 0n ? null : (Number(a) / Number(b)) * 100);

/**
 * The house result and where it came from, straight from the ledger: the four sources add up
 * exactly to GGR. Hold = GGR as a share of the stakes on bets settled in the range.
 */
export function GgrBreakdown({ m, prev, spark }: { m: Metrics; prev: Metrics | null; spark?: number[] }) {
  const hold = pctOf(m.revenue.ggr, m.revenue.settledTurnover);
  const rows = [
    { label: "Lost bets", value: m.revenue.bySource.lost },
    { label: "Won bets (net)", value: m.revenue.bySource.won },
    { label: "Cash outs (net)", value: m.revenue.bySource.cashout },
    { label: "Void refunds", value: m.revenue.bySource.void },
  ];
  const max = rows.reduce((n, r) => (r.value < 0n ? -r.value : r.value) > n ? (r.value < 0n ? -r.value : r.value) : n, 1n);
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <div className="flex items-end gap-3">
          <span className={`font-display text-[34px] font-extrabold leading-none tabular-nums ${m.revenue.ggr < 0n ? "text-danger" : "text-white"}`}>{ghs(m.revenue.ggr)}</span>
          {spark && <Spark values={spark} className="mb-1 h-8 w-24" />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fog">
          <Delta cur={m.revenue.ggr} prev={prev?.revenue.ggr ?? null} />
          <span>
            Hold <b className="tabular-nums text-white">{hold === null ? "—" : `${hold.toFixed(1)}%`}</b>
          </span>
          <span>
            on <b className="tabular-nums text-white">{ghs(m.revenue.settledTurnover)}</b> settled
          </span>
        </div>
        <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fog">Bonuses</dt>
            <dd className="tabular-nums text-white">{ghs(m.revenue.bonuses)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fog">NGR</dt>
            <dd className="tabular-nums text-white">{ghs(m.revenue.ngr)}</dd>
          </div>
          <div className="flex justify-between" title="Credited to players by staff ledger corrections; not part of GGR">
            <dt className="text-fog">Balance corrections</dt>
            <dd className="tabular-nums text-white">{ghs(m.revenue.adjustments)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fog">Profit</dt>
            <dd className="text-fog">not reported: costs aren&apos;t recorded</dd>
          </div>
        </dl>
      </div>
      <div>
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const mag = r.value < 0n ? -r.value : r.value;
            return (
              <li key={r.label} className="grid grid-cols-[8.5rem_1fr_7rem] items-center gap-3 text-sm">
                <span className="truncate text-fog">{r.label}</span>
                <span className="relative h-2 rounded-full bg-ink-500">
                  <span
                    className={`absolute inset-y-0 rounded-full ${r.value < 0n ? "right-1/2 bg-danger" : "left-1/2 bg-lime"}`}
                    style={{ width: `${(Number(mag) / Number(max)) * 50}%` }}
                  />
                  <span className="absolute inset-y-[-3px] left-1/2 w-px bg-fog/40" aria-hidden />
                </span>
                <span className={`text-right tabular-nums ${r.value < 0n ? "text-danger" : "text-white"}`}>{ghs(r.value)}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-semibold">
          <span className="text-fog">GGR</span>
          <span className="tabular-nums text-white">{ghs(m.revenue.ggr)}</span>
        </div>
      </div>
    </div>
  );
}

/** One line of live system status; the full board is on /admin/system. */
export function StatusRail({ alerts, lastSync }: { alerts: Alert[]; lastSync: string }) {
  const bad = alerts.filter((a) => a.level !== "ok");
  const worst = bad.some((a) => a.level === "critical") ? "critical" : bad.length ? "warn" : "ok";
  return (
    <Link href="/admin/system" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-line bg-ink-800 px-4 py-2.5 text-[13px] transition-colors duration-150 hover:border-ink-400">
      <span className="flex items-center gap-2 font-semibold text-white">
        <Light level={worst} pulse={worst !== "ok"} />
        {bad.length ? `${bad.length} issue${bad.length === 1 ? "" : "s"}` : "All systems normal"}
      </span>
      {bad.slice(0, 3).map((a) => (
        <span key={a.title} className="flex items-center gap-1.5 text-fog">
          <Light level={a.level} />
          {a.title}
        </span>
      ))}
      <span className="ml-auto text-fog">
        Odds synced <b className="text-white">{lastSync}</b>
      </span>
    </Link>
  );
}
