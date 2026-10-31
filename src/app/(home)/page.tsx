import Link from "next/link";
import { BallOrbit } from "@/components/BallOrbit";
import { START_FILTERS, competitionRank, listCompetitions, listFixtures, parseStartFilter, type UiFixture } from "@/lib/queries";
import { photos } from "@/lib/photos";
import { MatchTable } from "@/components/MatchTable";
import { FeaturedMatch } from "@/components/FeaturedMatch";
import { CompetitionStrip } from "@/components/CompetitionStrip";
import { HeroCarousel } from "@/components/HeroCarousel";
import { PromoSlide, bannerCtaClass } from "@/components/PromoSlide";
import { OpenSlipButton } from "@/components/OpenSlipButton";
import { TopMatches } from "@/components/TopMatches";
import { SportIcon } from "@/components/SportIcon";
import { Crest } from "@/components/Crest";

export const dynamic = "force-dynamic";

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
  // One headline match only: the next two already appear in the Top matches row just below, and
  // repeating them in the hero padded the top of the page and pushed the coupon off the screen.
  const featured = q ? [] : ranked.slice(0, 1);
  const activeComp = competitions.find((c) => c.id === comp);
  const unfiltered = !q && !sport && !comp && !hours;

  const perSport = new Map<string, number>();
  for (const c of competitions) perSport.set(c.sportKey, (perSport.get(c.sportKey) ?? 0) + c.count);

  // Every slide points at something real on the site, and only appears when it has data behind it.
  const live = unfiltered ? fixtures.filter((f) => new Date(f.startsAt).getTime() <= now).length : 0;
  const nba = unfiltered ? (perSport.get("basketball") ?? 0) : 0;
  const slides: { label: string; node: React.ReactNode }[] = [];
  featured.forEach((f, n) => slides.push({ label: `${f.homeTeam} v ${f.awayTeam}`, node: <FeaturedMatch f={f} priority={n === 0} /> }));
  if (unfiltered) {
    if (live > 0)
      slides.push({
        label: "Live now",
        node: (
          <PromoSlide
            photo={photos.footballStadiumCrowd}
            position="center 55%"
            eyebrow="Live now"
            title={`${live} ${live === 1 ? "match" : "matches"} in play`}
            cta="Go live"
            href="/live"
          />
        ),
      });
    if (nba > 0)
      slides.push({
        label: "Basketball",
        node: (
          <PromoSlide
            photo={photos.basketballDribbleSilhouette}
            position="center 40%"
            eyebrow="Basketball"
            title={`${nba} NBA ${nba === 1 ? "game" : "games"} open`}
            cta="Basketball odds"
            href="/?sport=basketball"
          />
        ),
      });
    slides.push({
      label: "Booking codes",
      node: (
        <PromoSlide
          photo={photos.footballBallSpotlight}
          position="center 65%"
          eyebrow="Booking codes"
          title="Load a friend's betslip with one code"
          cta="Load a code"
          action={<OpenSlipButton className={bannerCtaClass}>Load a code</OpenSlipButton>}
        />
      ),
    });
    slides.push({
      label: "Invite friends",
      node: (
        <PromoSlide photo={photos.footballStadiumDusk} position="center 60%" eyebrow="Referrals" title="Invite friends with your own code" cta="Get your code" href="/account" />
      ),
    });
  }

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

      {slides.length > 0 && (
        <HeroCarousel labels={slides.map((s) => s.label)}>
          {slides.map((s) => (
            <div key={s.label} className="h-full">
              {s.node}
            </div>
          ))}
        </HeroCarousel>
      )}

      {unfiltered && <TopMatches fixtures={ranked.slice(0, 10)} />}
      {!q && <CompetitionStrip competitions={competitions} active={comp} />}

      <section aria-labelledby="all-matches" className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="all-matches" className="section-title">
            {hours ? `Starting in ${hours}h` : "All matches"}
          </h2>
          {!q && <StartFilter hours={hours} sport={sport} comp={comp} />}
        </div>
        {fixtures.length === 0 ? <Empty q={q} filtered={!!(sport || comp || hours)} sport={sport} /> : <MatchTable fixtures={fixtures} rankOf={rankOf} />}
      </section>
    </div>
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
