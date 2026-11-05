import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { kickoffDay, kickoffTime } from "@/lib/time";
import { Crest } from "@/components/Crest";
import { ManualGameForm, GenerateMatchForm } from "@/components/AdminTools";
import { EmptyState, Head, Panel, Pill } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

/** Create games: generate a match or add one by hand. Results are entered on the trading desk. */
export default async function CreateGamesPage() {
  const gate = await adminPage(["fixtures.manage"]);
  if (!gate.ok) return gate.deny;

  const [competitions, upcoming] = await Promise.all([
    prisma.competition.findMany({ select: { sportKey: true, name: true }, orderBy: { name: "asc" } }),
    // Games made here (no feed reference) that haven't been settled yet, soonest first.
    prisma.fixture.findMany({
      where: { providerRef: null, status: { in: ["SCHEDULED", "LIVE"] } },
      orderBy: { startsAt: "asc" },
      take: 20,
      include: { competition: true },
    }),
  ]);
  const now = new Date();

  return (
    <>
      <Head title="Create games" description="Generate a match or add one by hand. Results are entered on the Trading desk." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="Generate a match" icon="plus">
            <GenerateMatchForm />
          </Panel>
          <Panel title="Add a manual game" icon="plus">
            <ManualGameForm competitions={competitions} />
          </Panel>
        </div>

        <Panel
          title="Open created games"
          icon="ticket"
          flush
          actions={
            <Link href="/admin/operations?queue=manual" className="text-xs font-semibold text-lime hover:underline">
              Settle on Trading desk →
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState icon="plus" title="No open games yet">
              Games you create here show up in this list until they&apos;re settled.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex -space-x-1.5">
                    <Crest name={f.homeTeam} src={f.homeTeamLogo} size="sm" />
                    <Crest name={f.awayTeam} src={f.awayTeamLogo} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {f.homeTeam} <span className="font-normal text-fog">v</span> {f.awayTeam}
                    </span>
                    <span className="block truncate text-xs text-fog">
                      {f.competition.displayName ?? f.competition.name} · {kickoffDay(f.startsAt.toISOString())} {kickoffTime(f.startsAt.toISOString())} · #{f.code}
                    </span>
                  </span>
                  {/* Generated games carry a script and settle themselves; hand-made ones need a result entered. */}
                  {f.script !== null && <Pill tone="neutral">generated</Pill>}
                  {f.startsAt > now ? <Pill tone="info">upcoming</Pill> : f.script === null ? <Pill tone="warn">needs result</Pill> : <Pill tone="good">in play</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
