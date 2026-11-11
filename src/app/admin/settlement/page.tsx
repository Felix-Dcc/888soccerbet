import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { openExposure } from "@/lib/adminStats";
import { formatPesewas } from "@/lib/money";
import { kickoffDay, kickoffTime } from "@/lib/time";
import { Crest } from "@/components/Crest";
import { SettleForm } from "@/components/AdminTools";
import { Head, KpiCard, Panel, Grid, EmptyState, Figure, Strip, Icon, Pill, td, ghs } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

export default async function SettlementPage() {
  const gate = await adminPage(["settlement.manage"]);
  if (!gate.ok) return gate.deny;
  const now = new Date();

  const [unsettled, recentlySettled, exposure] = await Promise.all([
    prisma.fixture.findMany({
      where: { status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { lte: now } },
      orderBy: { startsAt: "asc" },
      take: 60,
      include: { competition: true, _count: { select: { betSelections: { where: { status: "OPEN" } } } } },
    }),
    prisma.fixture.findMany({
      where: { status: "FINISHED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { competition: true },
    }),
    openExposure(),
  ]);

  const exposureTotal = exposure.reduce((n, e) => n + e.openStake, 0n);

  return (
    <>
      <Head title="Settlement Engine" description="Settle matches, review open exposure, and track recently settled fixtures." />

      {/* ── KPI Strip ── */}
      <Strip cols="grid-cols-2 md:grid-cols-4">
        <Figure label="Awaiting settlement" value={unsettled.length} />
        <Figure label="Open exposure" value={`GHS ${formatPesewas(exposureTotal)}`} />
        <Figure label="Matches at risk" value={exposure.length} note="with open bets" />
        <Figure label="Settled today" value={recentlySettled.filter((f) => f.updatedAt >= new Date(now.getTime() - 86400_000)).length} />
      </Strip>

      {/* ── Fixtures needing settlement ── */}
      <Panel title="Fixtures Needing Settlement" icon="desk" flush>
        {unsettled.length === 0 ? (
          <EmptyState icon="check" title="All matches settled">No fixtures are waiting for results.</EmptyState>
        ) : (
          <Grid head={["Match", "League", "Kickoff", "Open Bets", "Actions"]} minWidth="40rem">
            {unsettled.map((f) => (
              <tr key={f.id}>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <Crest name={f.homeTeam} src={f.homeTeamLogo} size="xs" />
                    <span className="font-semibold text-white">{f.homeTeam} vs {f.awayTeam}</span>
                  </div>
                </td>
                <td className={`${td} text-fog`}>{f.competition?.name ?? "Unknown"}</td>
                <td className={`${td} whitespace-nowrap text-fog`}>{kickoffDay(f.startsAt.toISOString())}, {kickoffTime(f.startsAt.toISOString())}</td>
                <td className={`${td} tabular-nums text-white`}>{f._count.betSelections}</td>
                <td className={td}><SettleForm fixtureId={f.id} home={f.homeTeam} away={f.awayTeam} started={f.startsAt <= now} manual={f.providerRef === null} startsAt={f.startsAt.toISOString()} homeScore={f.homeScore} awayScore={f.awayScore} /></td>
              </tr>
            ))}
          </Grid>
        )}
      </Panel>

      {/* ── Open Exposure ── */}
      <Panel title="Open Exposure by Match" icon="chart" flush>
        {exposure.length === 0 ? (
          <EmptyState icon="check" title="No open exposure" />
        ) : (
          <Grid head={["Match", "Open Legs", "Open Stake"]} right={[1, 2]} minWidth="30rem">
            {exposure.slice(0, 20).map((e) => (
              <tr key={e.fixtureId}>
                <td className={`${td} font-semibold text-white`}>{e.homeTeam} vs {e.awayTeam}</td>
                <td className={`${td} text-right tabular-nums text-white`}>{e.openLegs}</td>
                <td className={`${td} text-right tabular-nums text-lime`}>GHS {formatPesewas(e.openStake)}</td>
              </tr>
            ))}
          </Grid>
        )}
      </Panel>

      {/* ── Recently Settled ── */}
      <Panel title="Recently Settled" icon="check" flush>
        {recentlySettled.length === 0 ? (
          <EmptyState icon="check" title="No recent settlements" />
        ) : (
          <Grid head={["Match", "Score", "League", "Settled"]} minWidth="30rem">
            {recentlySettled.map((f) => (
              <tr key={f.id}>
                <td className={`${td} font-semibold text-white`}>{f.homeTeam} vs {f.awayTeam}</td>
                <td className={`${td} tabular-nums text-white`}>{f.homeScore} : {f.awayScore}</td>
                <td className={`${td} text-fog`}>{f.competition?.name ?? "Unknown"}</td>
                <td className={`${td} whitespace-nowrap text-fog`}>{kickoffDay(f.updatedAt.toISOString())}</td>
              </tr>
            ))}
          </Grid>
        )}
      </Panel>
    </>
  );
}
