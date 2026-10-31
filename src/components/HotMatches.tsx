import Link from "next/link";
import type { HotFixture } from "@/lib/queries";
import { AutoRefresh } from "./AutoRefresh";

const REFRESH_MINUTES = 10;

/**
 * "Hottest matches" rail panel: the fixtures carrying the most selections in the last hour,
 * ranked. Counts are real (one per selection placed) and popularity is each fixture's share of
 * the leader, so the ranking reads at a glance. A quiet hour shows the empty line, not filler.
 */
export function HotMatches({ fixtures }: { fixtures: HotFixture[] }) {
  const top = fixtures[0]?.picks ?? 1;
  return (
    <section aria-labelledby="hot-matches" className="card overflow-hidden">
      {/* The header's promise is kept by this timer, not by wishful copy. */}
      <AutoRefresh minutes={REFRESH_MINUTES} />

      <header className="bg-ink-600 px-3 py-2.5">
        <h2 id="hot-matches" className="flex items-start gap-2 text-[13px] font-bold leading-snug text-white">
          <FlameIcon />
          <span>Top 10 hottest matches in the past hour</span>
        </h2>
        <p className="mt-1 pl-6 text-[11px] text-fog-muted">Refresh every {REFRESH_MINUTES} minutes</p>
      </header>

      {fixtures.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-fog-muted">No bets placed in the last hour.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.25rem] items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-fog-muted">
            <span />
            <span>Match</span>
            <span className="flex items-center justify-end gap-1">
              Popularity
              <InfoIcon />
            </span>
          </div>
          <ol>
            {fixtures.map((f, i) => (
              <li key={f.id}>
                <Link
                  href={`/fixture/${f.id}`}
                  className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.25rem] items-center gap-2 px-3 py-2 transition-colors duration-150 hover:bg-ink-600/60"
                >
                  <span className="text-right text-sm font-bold tabular-nums text-fog-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] text-fog-muted">{f.competition}</span>
                    <span className="block truncate text-[13px] font-semibold text-white">
                      {f.homeTeam} <span className="text-[11px] font-normal text-fog-muted">vs</span> {f.awayTeam}
                    </span>
                  </span>
                  <span className="flex items-center justify-end gap-1.5">
                    <span aria-hidden className="h-1 w-6 overflow-hidden rounded-full bg-ink-500">
                      <span className="block h-full rounded-full bg-lime" style={{ width: `${Math.max(10, Math.round((f.picks / top) * 100))}%` }} />
                    </span>
                    <span className="text-xs font-bold tabular-nums text-lime">
                      {f.picks}
                      <span className="sr-only"> selections in the last hour</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-px h-4 w-4 shrink-0 text-gold" fill="currentColor" aria-hidden>
      <path d="M12 2.5c.5 3.1 2.4 4.3 3.8 5.8A6.9 6.9 0 0 1 18 13a6 6 0 1 1-12 0c0-1.7.7-3.1 1.8-4.2.2 1 .8 1.8 1.7 2.1.2-2.7 1.2-5.5 2.5-8.4Zm0 16.6a2.9 2.9 0 0 0 2.9-2.9c0-1.2-.5-2-1.4-2.9-.3 1-.9 1.5-1.7 1.7.1-1.3-.4-2.5-1.2-3.6-.9.8-1.5 1.9-1.5 3.1a2.9 2.9 0 0 0 2.9 2.6Z" />
    </svg>
  );
}

/** Explains what the column counts; the detail is in the title, not a separate legend. */
function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0 text-fog-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      role="img"
      aria-label="How many selections were placed on this match in the last hour"
    >
      <title>How many selections were placed on this match in the last hour</title>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
