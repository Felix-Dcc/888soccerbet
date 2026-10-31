import Link from "next/link";
import { notFound } from "next/navigation";
import { getFixture, type UiMarket } from "@/lib/queries";
import Image from "next/image";
import { sportPhoto } from "@/lib/photos";
import { kickoffLong } from "@/lib/time";
import { OddsButton } from "@/components/betslip/OddsButton";
import { Crest } from "@/components/Crest";
import { Countdown } from "@/components/Countdown";
import { LivePill } from "@/components/MatchTable";

export const dynamic = "force-dynamic";

/** Market categories for the match page; a tab only shows when the match has one of its markets. */
const CATEGORIES = [
  { key: "all", label: "All", types: null },
  { key: "main", label: "Main", types: ["MATCH_RESULT", "MONEYLINE", "DOUBLE_CHANCE", "DRAW_NO_BET"] },
  { key: "goals", label: "Goals", types: ["OVER_UNDER", "ALT_TOTAL", "HOME_TOTAL", "AWAY_TOTAL", "BTTS", "ODD_EVEN"] },
  { key: "handicap", label: "Handicap", types: ["HANDICAP", "ALT_HANDICAP"] },
  { key: "score", label: "Correct Score", types: ["CORRECT_SCORE"] },
] as const;

type Section = { key: string; title: string; kind: "single" | "lines" | "grid"; markets: UiMarket[] };

/**
 * Group markets the way books present them: every over/under line in one section (main line
 * included), every handicap line in one, each team's total in its own, correct score as a grid.
 * Markets arrive main-first (see MARKET_ORDER), so a duplicate extra line defers to the main one.
 */
function sectionsFor(markets: UiMarket[], sportKey: string): Section[] {
  const out: Section[] = [];
  const byKey = new Map<string, Section>();
  const add = (key: string, title: string, kind: Section["kind"], m: UiMarket) => {
    let sec = byKey.get(key);
    if (!sec) {
      sec = { key, title, kind, markets: [] };
      byKey.set(key, sec);
      out.push(sec);
    }
    sec.markets.push(m);
  };
  for (const m of markets) {
    if (m.type === "OVER_UNDER" || m.type === "ALT_TOTAL") add("ou", sportKey === "basketball" ? "Total Points" : "Over/Under", "lines", m);
    else if (m.type === "HANDICAP" || m.type === "ALT_HANDICAP") add("hcp", sportKey === "basketball" ? "Point Spread" : "Handicap", "lines", m);
    else if (m.type === "HOME_TOTAL" || m.type === "AWAY_TOTAL") add(m.type, m.name, "lines", m);
    else if (m.type === "CORRECT_SCORE") add(m.id, m.name, "grid", m);
    else add(m.id, m.name, "single", m);
  }
  for (const sec of out)
    if (sec.kind === "lines") {
      const seen = new Set<number | null>();
      sec.markets = sec.markets.filter((m) => !seen.has(m.line) && seen.add(m.line)).sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    }
  return out;
}

export default async function FixturePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const { id } = await params;
  const { m: rawCat } = await searchParams;
  const f = await getFixture(id);
  if (!f) notFound();
  const fixtureName = `${f.homeTeam} v ${f.awayTeam}`;
  const started = new Date(f.startsAt) <= new Date();
  const finished = f.status === "FINISHED" || f.status === "CANCELLED";
  const cats = CATEGORIES.filter((c) => !c.types || f.markets.some((m) => (c.types as readonly string[]).includes(m.type)));
  const cat = cats.find((c) => c.key === rawCat) ?? cats[0]!;
  const markets = cat.types ? f.markets.filter((m) => (cat.types as readonly string[]).includes(m.type)) : f.markets;

  return (
    <div className="space-y-5">
      <Link href={`/?comp=${f.competitionId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-fog hover:text-lime">
        ← {f.competition}
      </Link>

      <section className="theme-dark relative isolate overflow-hidden rounded-xl border border-white/[0.08] shadow-lift">
        {/* Neutral pitch/court photo: implies no club, unlike league or stadium imagery. */}
        <Image src={sportPhoto(f.sportKey)} alt="" fill priority placeholder="blur" sizes="(min-width: 1280px) 900px, 100vw" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(8,11,16,.55),rgba(8,11,16,.85)_60%,#080B10)]" />
        <div className="p-5 sm:p-8">
          <h1 className="sr-only">{fixtureName}</h1>
          <div className="flex items-center gap-2 text-xs text-white/80">
            <Crest name={f.competition} src={f.competitionBadge} size="sm" />
            <span className="font-bold uppercase tracking-[0.12em]">{f.competition}</span>
            <span className="ml-auto tabular-nums text-fog">ID {f.code}</span>
          </div>

          <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
            <Side name={f.homeTeam} logo={f.homeTeamLogo} />
            <div className="text-center">
              {f.homeScore !== null || f.awayScore !== null ? (
                <div className="font-display text-4xl font-extrabold tabular-nums text-white sm:text-5xl">
                  {f.homeScore ?? 0}<span className="mx-2 text-fog-muted">:</span>{f.awayScore ?? 0}
                </div>
              ) : (
                <div className="font-display text-3xl font-extrabold text-fog-muted">VS</div>
              )}
              <div className="mt-2">
                {finished ? (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-fog">Full time</span>
                ) : started ? (
                  <LivePill startsAt={f.startsAt} sportKey={f.sportKey} />
                ) : (
                  <Countdown to={f.startsAt} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-lime" />
                )}
              </div>
            </div>
            <Side name={f.awayTeam} logo={f.awayTeamLogo} />
          </div>

          <p className="mt-6 text-center text-xs text-fog">
            {kickoffLong(f.startsAt)}
            {f.venue && <span className="text-fog-muted"> · {f.venue}</span>}
          </p>
        </div>
      </section>

      {f.markets.length === 0 ? (
        <section className="card px-6 py-10 text-center font-display font-bold text-white">No odds for this match yet</section>
      ) : (
        <section aria-label="Markets" className="odds-board card overflow-hidden">
          {cats.length > 2 && (
            <nav aria-label="Market categories" className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
              {cats.map((c) => (
                <Link
                  key={c.key}
                  href={c.key === "all" ? `/fixture/${f.id}` : `/fixture/${f.id}?m=${c.key}`}
                  scroll={false}
                  aria-current={c.key === cat.key ? "page" : undefined}
                  className={`relative whitespace-nowrap px-3 pb-2.5 pt-1 text-sm font-semibold transition ${c.key === cat.key ? "text-lime" : "text-fog hover:text-white"}`}
                >
                  {c.label}
                  {c.key === cat.key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-lime" />}
                </Link>
              ))}
            </nav>
          )}
          <div className="divide-y divide-line">
            {sectionsFor(markets, f.sportKey).map((sec) => {
              const live = sec.markets.filter((m) => f.bettable && m.status === "OPEN");
              const first = sec.markets[0]!;
              const badge = first.status === "SETTLED" ? "Settled" : first.status === "SUSPENDED" ? "Suspended" : "Closed";
              const pick = (m: UiMarket, sel: UiMarket["selections"][number]) => ({
                selectionId: sel.id,
                fixtureId: f.id,
                milliOdds: sel.milliOdds,
                selectionName: sel.name,
                marketName: m.name,
                fixtureName,
              });
              // Label left, price right in one compact tile, so three outcomes fit side by side on a phone.
              const rowButton =
                "h-11 !flex-row justify-between gap-1 px-2.5 [&>span:first-child]:px-0 [&>span:first-child]:text-left [&>span:first-child]:text-[13px] [&>span:first-child]:font-medium [&>span:first-child]:normal-case [&>span:first-child]:tracking-normal [&>span:first-child]:opacity-100";
              return (
                <details key={sec.key} open className="group px-3 py-2.5 sm:px-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-1 [&::-webkit-details-marker]:hidden">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 -rotate-90 text-fog-muted transition group-open:rotate-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                    <h2 className="font-display text-sm font-bold text-white">{sec.title}</h2>
                    {sec.kind === "lines" && live.length > 1 && <span className="text-xs text-fog-muted">{live.length} lines</span>}
                    {!live.length && <span className="ml-auto rounded-full bg-ink-500 px-2 py-0.5 text-xs font-semibold text-fog-muted">{badge}</span>}
                  </summary>
                  {live.length > 0 && sec.kind === "single" && (
                    <div className={`mt-2 grid gap-1.5 ${live[0]!.selections.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                      {live[0]!.selections.map((sel) => (
                        <OddsButton key={sel.id} label={sel.name} className={rowButton} pick={pick(live[0]!, sel)} />
                      ))}
                    </div>
                  )}
                  {live.length > 0 && sec.kind === "lines" && <LineTable markets={live} handicap={sec.key === "hcp"} unit={f.sportKey === "basketball" ? "Points" : "Goals"} pick={pick} />}
                  {live.length > 0 && sec.kind === "grid" && <ScoreGrid market={live[0]!} home={f.homeTeam} away={f.awayTeam} pick={pick} />}
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Side({ name, logo }: { name: string; logo: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Crest name={name} src={logo} size="xl" />
      <span className="font-display text-base font-bold leading-tight text-white sm:text-2xl">{name}</span>
    </div>
  );
}

const COLUMN_LABEL: Record<string, string> = { OVER: "Over", UNDER: "Under", "1": "Home", "2": "Away" };
const lineLabel = (line: number | null, handicap: boolean) => (line === null ? "" : handicap && line > 0 ? `+${line}` : String(line));

/**
 * Every line of a market in one table, as books lay it out: a header naming the outcomes
 * (Over | Under, or Home | Away), then one row per line with its prices. Handicap lines are
 * shown from the home side (-1.5 = home gives 1.5 goals).
 */
function LineTable({
  markets,
  handicap,
  unit,
  pick,
}: {
  markets: UiMarket[];
  handicap: boolean;
  unit: string;
  pick: (m: UiMarket, sel: UiMarket["selections"][number]) => Parameters<typeof OddsButton>[0]["pick"];
}) {
  const codes = [...new Set(markets.flatMap((m) => m.selections.map((s) => s.code)))];
  const cell = "grid h-11 place-items-center rounded-md text-[13px] font-semibold";
  return (
    <div role="table" aria-label={handicap ? "Handicap lines" : "Lines"} className="mt-2 space-y-1.5">
      <div role="row" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${codes.length + 1}, minmax(0, 1fr))` }}>
        <span role="columnheader" className={`${cell} h-8 bg-ink-500/60 text-fog-muted`}>
          {handicap ? "Line" : unit}
        </span>
        {codes.map((c) => (
          <span key={c} role="columnheader" className={`${cell} h-8 bg-ink-500/60 text-fog-muted`}>
            {COLUMN_LABEL[c] ?? c}
          </span>
        ))}
      </div>
      {markets.map((m) => (
        <div key={m.id} role="row" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${codes.length + 1}, minmax(0, 1fr))` }}>
          <span role="rowheader" className={`${cell} bg-ink-600 tabular-nums text-white`}>
            {lineLabel(m.line, handicap)}
          </span>
          {codes.map((c) => {
            const sel = m.selections.find((s) => s.code === c);
            return sel ? (
              <span key={c} role="cell">
                <OddsButton className="h-11" pick={pick(m, sel)} />
              </span>
            ) : (
              <span key={c} role="cell" className={`${cell} bg-ink-600 text-fog-muted`}>
                –
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Correct score in three columns, as books lay it out: home wins | draws | away wins. */
function ScoreGrid({
  market,
  home,
  away,
  pick,
}: {
  market: UiMarket;
  home: string;
  away: string;
  pick: (m: UiMarket, sel: UiMarket["selections"][number]) => Parameters<typeof OddsButton>[0]["pick"];
}) {
  const goals = (code: string) => code.split("-").map(Number) as [number, number];
  const scores = market.selections.filter((sel) => sel.code !== "OTHER");
  const other = market.selections.find((sel) => sel.code === "OTHER");
  const col = (test: (h: number, a: number) => boolean) => scores.filter((sel) => test(...goals(sel.code)));
  const cols = [
    { title: home, sels: col((h, a) => h > a) },
    { title: "Draw", sels: col((h, a) => h === a) },
    { title: away, sels: col((h, a) => h < a) },
  ];
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {cols.map((c) => (
        <div key={c.title} className="min-w-0 space-y-2">
          <div className="truncate text-center text-xs font-semibold text-fog-muted">{c.title}</div>
          {c.sels.map((sel) => (
            <OddsButton key={sel.id} label={sel.name} className="h-12" pick={pick(market, sel)} />
          ))}
        </div>
      ))}
      {other && (
        <div className="col-span-3">
          <OddsButton label="Other" className="h-12" pick={pick(market, other)} />
        </div>
      )}
    </div>
  );
}
