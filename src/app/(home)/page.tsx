import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { BallOrbit } from "@/components/BallOrbit";
import { START_FILTERS, competitionRank, listCompetitions, listFixtures, parseStartFilter, type UiFixture } from "@/lib/queries";
import { MatchTable } from "@/components/MatchTable";
import { CompetitionStrip } from "@/components/CompetitionStrip";
import { HeroCarousel } from "@/components/HeroCarousel";
import { TopMatches } from "@/components/TopMatches";
import { SportIcon } from "@/components/SportIcon";
import { Crest } from "@/components/Crest";
import banner1 from "../../../public/img/banners/banner-1.jpg";
import banner2 from "../../../public/img/banners/banner-2.jpg";
import banner3 from "../../../public/img/banners/banner-3.jpg";
import banner4 from "../../../public/img/banners/banner-4.jpg";
import banner5 from "../../../public/img/banners/banner-5.jpg";

export const dynamic = "force-dynamic";

/** Home banners, all exactly 16:9 (1600x900) so they fill the slider without cropping. */
const BANNERS: { src: StaticImageData; label: string; href?: string }[] = [
  // Every banner's "Bet now" jumps to the match list further down this page.
  { src: banner1, label: "Every match. Every moment. Bet now", href: "/#all-matches" },
  { src: banner2, label: "Bet smart. Win big. Bet now", href: "/#all-matches" },
  { src: banner3, label: "Back your team. Bet now", href: "/#all-matches" },
  { src: banner4, label: "Bet on all major sports. Bet now", href: "/#all-matches" },
  { src: banner5, label: "Bet on the action", href: "/#all-matches" },
];

const hasMainMarket = (f: UiFixture) => f.markets.some((m) => (m.type === "MATCH_RESULT" || m.type === "MONEYLINE") && m.status === "OPEN");
const upcoming = (f: UiFixture, now: number) => f.bettable && new Date(f.startsAt).getTime() > now && hasMainMarket(f);
/** Top competition first, then fixtures with both crests, then soonest. */
const byPrestige = (a: UiFixture, b: UiFixture) =>
  competitionRank(a.competition) - competitionRank(b.competition) ||
  Number(!!b.homeTeamLogo && !!b.awayTeamLogo) - Number(!!a.homeTeamLogo && !!a.awayTeamLogo) ||
  a.startsAt.localeCompare(b.startsAt);

export default async function HomePage({ searchParams }: { searchParams: Promise<{ sport?: string; comp?: string; q?: string; hours?: string }> }) {
  const { sport, comp, q, hours: rawHours } = await searchParams;
  const hours = parseStartFilter(rawHours);
  const [competitions, fixtures] = await Promise.all([
    listCompetitions(),
    listFixtures({ sportKey: sport, competitionId: comp, q, withinHours: hours }),
  ]);
  const now = Date.now();
  const rankOf = Object.fromEntries(competitions.map((c) => [c.name, competitionRank(c.name)]));
  const ranked = fixtures.filter((f) => upcoming(f, now)).sort(byPrestige);
  const activeComp = competitions.find((c) => c.id === comp);
  const unfiltered = !q && !sport && !comp && !hours;

  return (
    <div className="flex flex-col gap-5">
      {q ? (
        <div className="flex items-baseline gap-2">
          <h1 className="section-title">Results for “{q}”</h1>
          <span className="text-sm tabular-nums text-fog-muted">{fixtures.length}</span>
          <Link href="/" className="ml-auto text-sm font-semibold text-fog hover:text-lime">
            Clear
          </Link>
        </div>
      ) : activeComp ? (
        <div className="flex items-center gap-3">
          <Crest name={activeComp.name} src={activeComp.badgeUrl} size="md" />
          <h1 className="section-title text-2xl">{activeComp.name}</h1>
        </div>
      ) : (
        <h1 className="sr-only">Sports betting</h1>
      )}

      {unfiltered && (
        <HeroCarousel labels={BANNERS.map((b) => b.label)} aspect="aspect-video">
          {BANNERS.map((b, n) => (
            <BannerSlide key={b.label} {...b} priority={n === 0} />
          ))}
        </HeroCarousel>
      )}

      {unfiltered && <TopMatches fixtures={ranked.slice(0, 10)} />}
      {!q && <CompetitionStrip competitions={competitions} active={comp} />}

      <section aria-labelledby="all-matches" className="space-y-3">
        {/* scroll-mt: "Bet now" banners land here below the sticky header, not under it. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="all-matches" className="section-title scroll-mt-20">
            {hours ? `Starting in ${hours}h` : "All matches"}
          </h2>
          {!q && <StartFilter hours={hours} sport={sport} comp={comp} />}
        </div>
        {fixtures.length === 0 ? <Empty q={q} filtered={!!(sport || comp || hours)} sport={sport} /> : <MatchTable fixtures={fixtures} rankOf={rankOf} />}
      </section>
    </div>
  );
}

/** One home banner: the whole picture, edge to edge; clickable when it carries a call to action. */
function BannerSlide({ src, label, href, priority }: { src: StaticImageData; label: string; href?: string; priority: boolean }) {
  // Later slides load eagerly too: they sit off-screen sideways, so lazy loading would show a blur on first slide-in.
  const img = (
    <Image src={src} alt={label} fill priority={priority} loading={priority ? undefined : "eager"} placeholder="blur" sizes="(min-width: 1280px) 900px, 100vw" className="object-cover" draggable={false} />
  );
  return href ? (
    <Link href={href} className="relative block h-full">
      {img}
    </Link>
  ) : (
    <div className="relative h-full">{img}</div>
  );
}

/** "Starts within" filter: links keep the current sport/competition. */
function StartFilter({ hours, sport, comp }: { hours?: number; sport?: string; comp?: string }) {
  const href = (h?: number) => {
    const p = new URLSearchParams();
    if (sport) p.set("sport", sport);
    if (comp) p.set("comp", comp);
    if (h) p.set("hours", String(h));
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };
  const options: (number | undefined)[] = [undefined, ...START_FILTERS];
  return (
    <nav aria-label="Filter by start time" className="ml-auto flex items-center gap-1 rounded-full border border-line bg-ink-700 p-1 text-xs font-bold">
      {options.map((h) => (
        <Link
          key={h ?? "all"}
          href={href(h)}
          scroll={false}
          aria-current={h === hours ? "page" : undefined}
          className={`rounded-full px-2.5 py-1 transition ${h === hours ? "bg-lime text-lime-ink" : "text-fog hover:text-white"}`}
        >
          {h ? `${h}h` : "All"}
        </Link>
      ))}
    </nav>
  );
}

function Empty({ q, filtered, sport }: { q?: string; filtered: boolean; sport?: string }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      {q ? (
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-500 text-fog">
          <SportIcon sport="search" className="h-7 w-7" />
        </span>
      ) : (
        <BallOrbit sport={sport} className="h-24 w-24" />
      )}
      <div className="font-display text-lg font-bold text-white">{q ? "No matches found" : "No matches open right now"}</div>
      {(q || filtered) && (
        <Link href="/" className="btn-ghost px-4 py-2 text-sm">
          All matches
        </Link>
      )}
    </div>
  );
}
