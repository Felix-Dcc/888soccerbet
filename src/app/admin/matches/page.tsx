import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { kickoffDay, kickoffTime } from "@/lib/time";
import { Crest } from "@/components/Crest";
import { SettleForm } from "@/components/AdminTools";
import { Head, Grid, Tabs, Pill, EmptyState, td, pageOf, Pager } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const PER_PAGE = 40;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["bets.view", "settlement.manage", "fixtures.manage"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const sp = await searchParams;
  const filter = sp.filter ?? "all";
  const page = pageOf(sp.page);
  const now = new Date();

  const where =
    filter === "upcoming" ? { status: "SCHEDULED" as const, startsAt: { gt: now }, providerRef: null }
    : filter === "live" ? { status: "LIVE" as const }
    : filter === "finished" ? { status: "FINISHED" as const }
    : {};

  const [fixtures, total] = await Promise.all([
    prisma.fixture.findMany({
      where,
      orderBy: { startsAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { competition: true, _count: { select: { betSelections: { where: { status: "OPEN" } } } } },
    }),
    prisma.fixture.count({ where }),
  ]);

  const [allCount, upcomingCount, liveCount, finishedCount] = await Promise.all([
    prisma.fixture.count(),
    prisma.fixture.count({ where: { status: "SCHEDULED", startsAt: { gt: now }, providerRef: null } }),
    prisma.fixture.count({ where: { status: "LIVE" } }),
    prisma.fixture.count({ where: { status: "FINISHED" } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <>
      <Head title="Match & Odds Management" description="Manage matches, update scores, manually settle results, and handle odds." />

      <Tabs
        current={filter}
        tabs={[
          { key: "all", label: "All Matches", href: "/admin/matches?filter=all", count: allCount },
          { key: "upcoming", label: "Upcoming Simulated", href: "/admin/matches?filter=upcoming", count: upcomingCount },
          { key: "live", label: "Live Matches", href: "/admin/matches?filter=live", count: liveCount },
          { key: "finished", label: "Finished", href: "/admin/matches?filter=finished", count: finishedCount },
        ]}
      />

      {fixtures.length === 0 ? (
        <EmptyState icon="check" title="No matches found" />
      ) : (
        <>
          <Grid head={["Match", "Score", "League", "Start Time", "Status", "Actions"]} minWidth="50rem">
            {fixtures.map((f) => (
              <tr key={f.id}>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <Crest name={f.homeTeam} src={f.homeTeamLogo} size="xs" />
                    <span className="font-semibold text-white">{f.homeTeam} vs {f.awayTeam}</span>
                    <Crest name={f.awayTeam} src={f.awayTeamLogo} size="xs" />
                  </div>
                  {f.providerRef && <span className="text-xs text-lime">h2h (Active)</span>}
                </td>
                <td className={`${td} tabular-nums text-white`}>
                  {f.homeScore != null && f.awayScore != null ? `${f.homeScore} : ${f.awayScore}` : "— : —"}
                </td>
                <td className={`${td} text-fog`}>
                  {f.competition ? `${f.competition.sport} / ${f.competition.name}` : "Unknown"}
                </td>
                <td className={`${td} whitespace-nowrap text-fog`}>
                  {kickoffDay(f.startsAt.toISOString())}, {kickoffTime(f.startsAt.toISOString())}
                </td>
                <td className={td}>
                  <Pill tone={f.status === "FINISHED" ? "neutral" : f.status === "LIVE" ? "warn" : f.status === "CANCELLED" ? "bad" : "good"}>
                    {f.status}
                  </Pill>
                  {f.providerRef === null && f.status !== "FINISHED" && <Pill tone="warn">SIMULATED</Pill>}
                </td>
                <td className={td}>
                  {can(u, "settlement.manage") && f.status !== "FINISHED" && f.status !== "CANCELLED" && (
                    <SettleForm fixtureId={f.id} home={f.homeTeam} away={f.awayTeam} started={f.startsAt <= now} manual={f.providerRef === null} startsAt={f.startsAt.toISOString()} homeScore={f.homeScore} awayScore={f.awayScore} />
                  )}
                </td>
              </tr>
            ))}
          </Grid>
          {pages > 1 && <Pager path="/admin/matches" page={page} pages={pages} params={{ filter }} />}
        </>
      )}
    </>
  );
}
