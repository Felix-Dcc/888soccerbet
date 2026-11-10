import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { parseRange, previousRange, recentActivity, scopeMetrics } from "@/lib/adminAnalytics";
import { Head, KpiCard, Panel, Grid, Range, EmptyState, btnGhost, ghs, td, when, Icon } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const num = (p: bigint) => Number(p) / 100;
const pct = (n: number, d: number) => (d === 0 ? "0.00%" : `${((n / d) * 100).toFixed(2)}%`);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["reports.view"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const sp = await searchParams;
  const range = parseRange(sp);
  const all = { kind: "all" as const };
  const [m, activity] = await Promise.all([
    scopeMetrics(all, range),
    recentActivity(all, can(u, "audit_logs.view"), 30),
  ]);

  const totalVolume = m.betting.placed.stakes;
  const ggr = m.revenue.ggr;
  const settledTurnover = m.revenue.settledTurnover;
  const margin = settledTurnover > 0n ? ((Number(ggr) / Number(settledTurnover)) * 100).toFixed(2) + "%" : "0.00%";

  return (
    <>
      <Head title="Analytics Dashboard" description="Key performance indicators, financial reports, and platform health.">
        <Range path="/admin/analytics" current={range.key} />
        {can(u, "reports.export") && (
          <a href="/api/admin/export?kind=bets" className={btnGhost}>
            <Icon name="download" /> Export CSV
          </a>
        )}
      </Head>

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Icon name="chart" className="h-5 w-5" />}
          iconBg="bg-blue-500/20 text-blue-400"
          badge="All time"
          value={ghs(totalVolume)}
          label="TOTAL VOLUME"
        />
        <KpiCard
          icon={<Icon name="desk" className="h-5 w-5" />}
          iconBg="bg-green-500/20 text-green-400"
          badge="$"
          value={ghs(ggr)}
          label="GGR (PROFIT)"
        />
        <KpiCard
          icon={<Icon name="chart" className="h-5 w-5" />}
          iconBg="bg-purple-500/20 text-purple-400"
          badge="Hold %"
          value={margin}
          label="PLATFORM MARGIN"
        />
        <KpiCard
          icon={<Icon name="players" className="h-5 w-5" />}
          iconBg="bg-orange-500/20 text-orange-400"
          badge="Total"
          value={m.players.total.toLocaleString()}
          label="TOTAL USERS"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* ── Financial Summary ── */}
        <Panel title="Financial Summary" icon="desk">
          <dl className="divide-y divide-line text-sm">
            <div className="flex items-center justify-between py-3">
              <dt className="text-fog">Total Stakes In</dt>
              <dd className="font-semibold text-lime">{ghs(totalVolume)}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-fog">Total Payouts Out</dt>
              <dd className="font-semibold text-danger">{ghs(m.betting.won.paid + m.betting.cashouts.paid + m.betting.void.refunded)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-lime/5 px-4 py-3">
              <dt className="font-bold text-white">Net Profit</dt>
              <dd className={`font-bold ${ggr >= 0n ? "text-lime" : "text-danger"}`}>{ghs(ggr)}</dd>
            </div>
          </dl>
        </Panel>

        {/* ── Recent Activity Stream ── */}
        <Panel title="Recent Activity Stream" icon="audit" flush>
          {activity.length === 0 ? (
            <EmptyState icon="audit" title="No recent activity" />
          ) : (
            <Grid head={["Activity", "Time"]} minWidth="24rem">
              {activity.slice(0, 15).map((a, i) => (
                <tr key={i}>
                  <td className={`${td} text-white`}>{a.text}</td>
                  <td className={`${td} whitespace-nowrap text-fog`}>{when(a.at)}</td>
                </tr>
              ))}
            </Grid>
          )}
        </Panel>
      </div>
    </>
  );
}
