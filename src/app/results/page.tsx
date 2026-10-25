import Link from "next/link";
import { BallOrbit } from "@/components/BallOrbit";
import { listResults, type UiFixture } from "@/lib/queries";
import { PageHero } from "@/components/PageHero";
import { Crest } from "@/components/Crest";
import { photos } from "@/lib/photos";
import { kickoffDay, kickoffTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const SPORTS = [
  { key: undefined, label: "All" },
  { key: "football", label: "Football" },
  { key: "basketball", label: "Basketball" },
] as const;

/** Final scores of settled matches from the last three days, grouped by kick-off day. */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport: raw } = await searchParams;
  const sport = SPORTS.find((s) => s.key === raw)?.key;
  const results = await listResults({ sportKey: sport });

  const days = new Map<string, UiFixture[]>();
  for (const f of results) {
    const d = kickoffDay(f.startsAt);
    days.set(d, [...(days.get(d) ?? []), f]);
  }

  return (
    <div className="space-y-5">
      <PageHero title="Results" photo={photos.footballBallNight} position="center 65%" />

      <nav aria-label="Sport" className="flex gap-2">
        {SPORTS.map((s) => (
          <Link key={s.label} href={s.key ? `/results?sport=${s.key}` : "/results"} aria-current={s.key === sport ? "page" : undefined} className={`chip ${s.key === sport ? "chip-active" : ""}`}>
            {s.label}
          </Link>
        ))}
      </nav>

      {results.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
          <BallOrbit sport={sport} className="h-24 w-24" />
          <div className="font-display text-lg font-bold text-white">No results in the last 3 days</div>
        </div>
      ) : (
        [...days].map(([day, rows]) => (
          <section key={day} aria-label={day} className="card overflow-hidden">
            <h2 className="border-b border-line bg-ink-600/60 px-4 py-2.5 font-display text-sm font-bold text-white">{day}</h2>
            <ul className="divide-y divide-line">
              {rows.map((f) => (
                <li key={f.id}>
                  <Link href={`/fixture/${f.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.025]">
                    <div className="w-12 shrink-0 text-xs tabular-nums text-fog-muted">
                      {kickoffTime(f.startsAt)}
                      <div className="font-bold text-fog">FT</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-fog-muted">
                        <Crest name={f.competition} src={f.competitionBadge} size="xs" />
                        <span className="truncate">{f.competition}</span>
                      </div>
                      <Side name={f.homeTeam} logo={f.homeTeamLogo} score={f.homeScore!} won={f.homeScore! > f.awayScore!} />
                      <Side name={f.awayTeam} logo={f.awayTeamLogo} score={f.awayScore!} won={f.awayScore! > f.homeScore!} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Side({ name, logo, score, won }: { name: string; logo: string | null; score: number; won: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Crest name={name} src={logo} size="xs" />
      <span className={`truncate text-sm ${won ? "font-bold text-white" : "font-medium text-fog"}`}>{name}</span>
      <span className={`ml-auto pl-2 text-sm tabular-nums ${won ? "font-extrabold text-white" : "font-semibold text-fog"}`}>{score}</span>
    </div>
  );
}
