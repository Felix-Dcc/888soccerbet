import Link from "next/link";
import type { UiFixture } from "@/lib/queries";
import { kickoffDay, kickoffTime } from "@/lib/time";
import { OddsButton } from "./betslip/OddsButton";
import { Crest } from "./Crest";

/** Horizontal rail of headline fixtures as cards (crests, kickoff, 1X2), like "Top matches" on major books. */
export function TopMatches({ fixtures }: { fixtures: UiFixture[] }) {
  if (!fixtures.length) return null;
  return (
    <section aria-labelledby="top-matches">
      <h2 id="top-matches" className="section-title mb-3">Top matches</h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {fixtures.map((f) => {
          const m = f.markets.find((x) => (x.type === "MATCH_RESULT" || x.type === "MONEYLINE") && x.status === "OPEN");
          return (
            <li key={f.id} className="card card-hover w-[272px] shrink-0 snap-start overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.05] to-transparent px-3 py-2">
                <Crest name={f.competition} src={f.competitionBadge} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-fog">{f.competition}</span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white">
                  {kickoffDay(f.startsAt)} {kickoffTime(f.startsAt)}
                </span>
              </div>
              <Link href={`/fixture/${f.id}`} className="group grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-4">
                <span className="flex min-w-0 flex-col items-center gap-2 text-center">
                  <Crest name={f.homeTeam} src={f.homeTeamLogo} size="md" />
                  <span className="line-clamp-2 text-xs font-bold leading-tight text-white group-hover:text-lime">{f.homeTeam}</span>
                </span>
                <span className="text-xs font-extrabold text-fog-muted">VS</span>
                <span className="flex min-w-0 flex-col items-center gap-2 text-center">
                  <Crest name={f.awayTeam} src={f.awayTeamLogo} size="md" />
                  <span className="line-clamp-2 text-xs font-bold leading-tight text-white group-hover:text-lime">{f.awayTeam}</span>
                </span>
              </Link>
              {m && (
                <div className={`grid gap-1.5 px-3 pb-3 ${m.selections.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {m.selections.map((s) => (
                    <OddsButton
                      key={s.id}
                      label={s.code === "1" || s.code === "X" || s.code === "2" ? s.code : s.name}
                      pick={{ selectionId: s.id, fixtureId: f.id, milliOdds: s.milliOdds, selectionName: s.name, marketName: m.name, fixtureName: `${f.homeTeam} v ${f.awayTeam}` }}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
