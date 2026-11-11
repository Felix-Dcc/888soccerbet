import Link from "next/link";
import type { UiFixture } from "@/lib/queries";
import { kickoffShortDate, kickoffTime } from "@/lib/time";
import { OddsButton } from "./betslip/OddsButton";
import { liveScore } from "@/lib/markets";
import { Crest } from "./Crest";

/**
 * Horizontal rail of headline fixtures, laid out the way the big books show a featured card:
 * the kick-off sits between the two crests, the main market runs underneath, and the footer
 * carries the competition and a link to the rest of that match's markets.
 */
export function TopMatches({ fixtures }: { fixtures: UiFixture[] }) {
  if (!fixtures.length) return null;
  return (
    <section aria-labelledby="top-matches">
      <h2 id="top-matches" className="section-title mb-3">
        Top matches
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {fixtures.map((f) => {
          const m = f.markets.find((x) => (x.type === "MATCH_RESULT" || x.type === "MONEYLINE") && x.status === "OPEN");
          // Everything else this match offers, beyond the market already on the card.
          const more = Math.max(0, f.markets.filter((x) => x.status === "OPEN").length - (m ? 1 : 0));
          return (
            <li key={f.id} className="card card-hover flex w-[272px] shrink-0 snap-start flex-col overflow-hidden">
              <span className="px-3 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-fog-muted">Pre-match</span>

              <Link href={`/fixture/${f.id}`} className="group grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-3 pb-3 pt-2">
                <span className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                  <Crest name={f.homeTeam} src={f.homeTeamLogo} size="md" />
                  <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white group-hover:text-lime">{f.homeTeam}</span>
                </span>

                <span className="flex flex-col items-center px-1 pt-2">
                  <span className="font-display text-lg font-extrabold leading-none tabular-nums text-white">{kickoffTime(f.startsAt)}</span>
                  <span className="mt-1 text-[10px] tabular-nums text-fog-muted">{kickoffShortDate(f.startsAt)}</span>
                </span>

                <span className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                  <Crest name={f.awayTeam} src={f.awayTeamLogo} size="md" />
                  <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white group-hover:text-lime">{f.awayTeam}</span>
                </span>
              </Link>

              {m && (
                <div className={`grid gap-1.5 px-3 pb-3 ${m.selections.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {m.selections.map((s) => (
                    <OddsButton
                      key={s.id}
                      label={s.code === "1" || s.code === "X" || s.code === "2" ? s.code : s.name}
                      pick={{ selectionId: s.id, fixtureId: f.id, milliOdds: s.milliOdds, selectionName: s.name, marketName: m.name, fixtureName: `${f.homeTeam} v ${f.awayTeam}`, score: liveScore(f) }}
                    />
                  ))}
                </div>
              )}

              <div className="mt-auto flex items-center gap-2 border-t border-line px-3 py-2">
                <Crest name={f.competition} src={f.competitionBadge} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-fog-muted">{f.competition}</span>
                {more > 0 && (
                  <Link href={`/fixture/${f.id}`} className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-lime hover:underline">
                    More markets ({more}) ›
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
