import Link from "next/link";
import type { UiCompetition } from "@/lib/queries";
import { Crest } from "./Crest";

/** Horizontal competition picker with official badges (below xl, where the side rail is hidden). */
export function CompetitionStrip({ competitions, active }: { competitions: UiCompetition[]; active?: string }) {
  if (!competitions.length) return null;
  return (
    <nav aria-label="Competitions" className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 xl:hidden">
      {competitions.map((c) => {
        const on = c.id === active;
        return (
          <Link
            key={c.id}
            href={on ? "/" : `/?comp=${c.id}`}
            aria-current={on ? "page" : undefined}
            className={`card card-hover flex w-28 shrink-0 snap-start flex-col items-center gap-2 px-2 py-3 text-center ${on ? "border-lime/60 bg-lime/[0.07]" : ""}`}
          >
            <Crest name={c.name} src={c.badgeUrl} size="md" />
            <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white">{c.name}</span>
            <span className="text-[10px] font-semibold tabular-nums text-fog-muted">
              {c.count} {c.count === 1 ? "match" : "matches"}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
