import { Fragment } from "react";
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

/**
 * Final scores from the last three days, grouped by competition with day separators inside —
 * the same shape as the coupon on the home page, so a league reads the same wherever it appears.
 */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport: raw } = await searchParams;
  const sport = SPORTS.find((s) => s.key === raw)?.key;
  const results = await listResults({ sportKey: sport });

  // Competition order follows the server's (already sorted) list, by first appearance.
  const groups = new Map<string, { id: string; name: string; badge: string | null; rows: UiFixture[] }>();
  for (const f of results) {
    const g = groups.get(f.competitionId) ?? { id: f.competitionId, name: f.competition, badge: f.competitionBadge, rows: [] };
    g.rows.push(f);
    groups.set(f.competitionId, g);
  }

  return (
    <div className="space-y-5">
      <PageHero title="Results" photo={photos.footballBallNight} position="center 65%" />

      <nav aria-label="Sport" className="flex gap-2">
        {SPORTS.map((s) => (
          <Link
            key={s.label}
            href={s.key ? `/results?sport=${s.key}` : "/results"}
            aria-current={s.key === sport ? "page" : undefined}
            className={`chip ${s.key === sport ? "chip-active" : ""}`}
          >
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
        [...groups.values()].map((g) => (
          <section key={g.id} aria-labelledby={`res-${g.id}`} className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line bg-ink-600/50 px-3 py-2.5 sm:gap-3">
              <Crest name={g.name} src={g.badge} size="sm" />
              <span id={`res-${g.id}`} className="min-w-0 flex-1 truncate font-display text-sm font-bold text-white">
                {g.name}
              </span>
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-fog-muted">Final</span>
            </header>
            <ul>
              {g.rows.map((f, i) => {
                const day = kickoffDay(f.startsAt);
                const newDay = i === 0 || day !== kickoffDay(g.rows[i - 1]!.startsAt);
                return (
                  <Fragment key={f.id}>
                    {newDay && (
                      <li className="border-t border-line bg-ink-900/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-fog-muted first:border-t-0">
                        {day}
                      </li>
                    )}
                    <li className="border-t border-line">
                      <Link href={`/fixture/${f.id}`} className="flex items-center gap-2 px-3 py-2 transition hover:bg-ink-600/40 sm:gap-3">
                        <div className="hidden w-14 shrink-0 text-center sm:block">
                          <div className="text-sm font-bold tabular-nums text-white">{kickoffTime(f.startsAt)}</div>
                          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-fog-muted">FT</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] tabular-nums text-fog-muted sm:hidden">
                            {kickoffTime(f.startsAt)}
                            <span className="font-bold uppercase tracking-wider">FT</span>
                          </div>
                          <Side name={f.homeTeam} logo={f.homeTeamLogo} score={f.homeScore ?? 0} won={(f.homeScore ?? 0) > (f.awayScore ?? 0)} />
                          <Side name={f.awayTeam} logo={f.awayTeamLogo} score={f.awayScore ?? 0} won={(f.awayScore ?? 0) > (f.homeScore ?? 0)} />
                        </div>
                      </Link>
                    </li>
                  </Fragment>
                );
              })}
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
