"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { UiFixture, UiMarket } from "@/lib/queries";
import { OddsButton } from "./betslip/OddsButton";
import { liveScore } from "@/lib/markets";
import { Crest } from "./Crest";
import { kickoffDay, kickoffTime } from "@/lib/time";
import { liveClockLabel } from "@/lib/liveClock";

/** Market tabs. A tab only appears when at least one listed fixture actually has that market. */
const TABS = [
  { key: "result", label: "1X2", types: ["MATCH_RESULT", "MONEYLINE"], cols: [["1", "1"], ["X", "X"], ["2", "2"]], lined: false },
  { key: "total", label: "Over/Under", types: ["OVER_UNDER"], cols: [["OVER", "Over"], ["UNDER", "Under"]], lined: true },
  { key: "dc", label: "Double Chance", types: ["DOUBLE_CHANCE"], cols: [["1X", "1X"], ["12", "12"], ["X2", "X2"]], lined: false },
  { key: "btts", label: "GG/NG", types: ["BTTS"], cols: [["BTTS_YES", "GG"], ["BTTS_NO", "NG"]], lined: false },
  { key: "hcp", label: "Handicap", types: ["HANDICAP"], cols: [["1", "1"], ["2", "2"]], lined: true },
  { key: "dnb", label: "Draw No Bet", types: ["DRAW_NO_BET"], cols: [["1", "1"], ["2", "2"]], lined: false },
] as const;
type Tab = (typeof TABS)[number];
const TOTALS = TABS[1];
const CELL = "w-[3.25rem] shrink-0 sm:w-14";
const LINE = "w-10 shrink-0 text-right";

const marketFor = (f: UiFixture, t: Tab): UiMarket | undefined => f.markets.find((m) => (t.types as readonly string[]).includes(m.type));
const isStarted = (f: UiFixture) => new Date(f.startsAt).getTime() <= Date.now();
const dayOf = (f: UiFixture) => (isStarted(f) ? "Live" : kickoffDay(f.startsAt));

/** Competition order follows the server's (already sorted) fixture list by first appearance. */
export function MatchTable({ fixtures, rankOf }: { fixtures: UiFixture[]; rankOf?: Record<string, number> }) {
  const tabs = useMemo(
    () => TABS.filter((t) => fixtures.some((f) => f.markets.some((m) => (t.types as readonly string[]).includes(m.type)))),
    [fixtures],
  );
  const [tabKey, setTabKey] = useState<Tab["key"]>("result");
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0] ?? TABS[0];
  // On wide screens the 1X2 view also carries the totals market, so a row reads like a coupon line.
  const withTotals = tab.key === "result";

  const groups = useMemo(() => {
    const by = new Map<string, { id: string; name: string; badge: string | null; sportKey: string; rows: UiFixture[] }>();
    for (const f of fixtures) {
      const g = by.get(f.competitionId) ?? { id: f.competitionId, name: f.competition, badge: f.competitionBadge, sportKey: f.sportKey, rows: [] };
      g.rows.push(f);
      by.set(f.competitionId, g);
    }
    return [...by.values()]
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => Number(isStarted(b)) - Number(isStarted(a)) || a.startsAt.localeCompare(b.startsAt)) }))
      .sort((a, b) => (rankOf?.[a.name] ?? 99) - (rankOf?.[b.name] ?? 99) || a.rows[0]!.startsAt.localeCompare(b.rows[0]!.startsAt));
  }, [fixtures, rankOf]);

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Markets" className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={t.key === tab.key} onClick={() => setTabKey(t.key)} className={`chip ${t.key === tab.key ? "chip-active" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`comp-${g.id}`} className="card animate-fade-in overflow-hidden">
          <header className="flex items-center gap-2 border-b border-line bg-ink-600/50 px-3 py-2.5 sm:gap-3">
            <Crest name={g.name} src={g.badge} size="sm" />
            <Link id={`comp-${g.id}`} href={`/?comp=${g.id}`} className="min-w-0 flex-1 truncate font-display text-sm font-bold text-white hover:text-lime">
              {g.name}
            </Link>
            <ColumnLabels tab={tab} withTotals={withTotals} totalsLabel={g.sportKey === "basketball" ? "Pts" : "Goals"} />
          </header>
          <ul>
            {g.rows.map((f, i) => {
              const day = dayOf(f);
              const newDay = i === 0 || day !== dayOf(g.rows[i - 1]!);
              return (
                <Fragment key={f.id}>
                  {newDay && (
                    <li className={`border-t border-line bg-ink-900/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider first:border-t-0 ${day === "Live" ? "text-danger" : "text-fog-muted"}`}>
                      {day}
                    </li>
                  )}
                  <Row f={f} tab={tab} withTotals={withTotals} />
                </Fragment>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ColumnLabels({ tab, withTotals, totalsLabel }: { tab: Tab; withTotals: boolean; totalsLabel: string }) {
  const label = (code: string, text: string) => (
    <span key={code} className={`${CELL} text-center`}>
      {text}
    </span>
  );
  return (
    <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-fog-muted">
      {tab.lined && <span className={LINE} />}
      {tab.cols.map(([code, text]) => label(code, text))}
      {withTotals && (
        <span className="hidden items-center gap-1 md:flex">
          <span className={`${LINE} ml-2`}>{totalsLabel}</span>
          {TOTALS.cols.map(([code, text]) => label(code, text))}
        </span>
      )}
      <span className="hidden w-10 shrink-0 md:block" />
    </div>
  );
}

function Row({ f, tab, withTotals }: { f: UiFixture; tab: Tab; withTotals: boolean }) {
  const started = isStarted(f);
  const market = marketFor(f, tab);
  const totals = withTotals ? marketFor(f, TOTALS) : undefined;
  const openMarkets = f.markets.filter((m) => m.status === "OPEN").length;
  const more = openMarkets - [market, totals].filter((m) => m?.status === "OPEN").length;

  return (
    <li className="flex items-center gap-2 border-t border-line px-3 py-2 transition hover:bg-ink-600/40 sm:gap-3">
      <div className="hidden w-14 shrink-0 text-center sm:block">
        {started ? <LivePill startsAt={f.startsAt} sportKey={f.sportKey} /> : <div className="text-sm font-bold tabular-nums text-white">{kickoffTime(f.startsAt)}</div>}
        <div className="mt-0.5 text-[10px] tabular-nums text-fog-muted">ID {f.code}</div>
      </div>

      <Link href={`/fixture/${f.id}`} className="group min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-fog-muted sm:hidden">
          {started ? <LivePill startsAt={f.startsAt} sportKey={f.sportKey} /> : <span className="font-semibold text-fog">{kickoffTime(f.startsAt)}</span>}
          <span className="tabular-nums">ID {f.code}</span>
        </div>
        <Team name={f.homeTeam} logo={f.homeTeamLogo} score={f.homeScore} goal={f.sportKey === "football"} />
        <Team name={f.awayTeam} logo={f.awayTeamLogo} score={f.awayScore} goal={f.sportKey === "football"} />
      </Link>

      <div className="flex items-center gap-1">
        {tab.lined && <Line market={market} />}
        <Cells f={f} market={market} cols={tab.cols} started={started} />
        {withTotals && (
          <div className="hidden items-center gap-1 md:flex">
            <span className="ml-2">
              <Line market={totals} />
            </span>
            <Cells f={f} market={totals} cols={TOTALS.cols} started={started} />
          </div>
        )}
        <Link
          href={`/fixture/${f.id}`}
          aria-label={`All markets for ${f.homeTeam} v ${f.awayTeam}`}
          className="hidden w-10 shrink-0 items-center justify-end gap-0.5 text-xs font-bold tabular-nums text-fog hover:text-lime md:flex"
        >
          {more > 0 && `+${more}`}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      </div>
    </li>
  );
}

function Line({ market }: { market: UiMarket | undefined }) {
  if (market?.line == null) return <span className={LINE} />;
  const v = market.type === "HANDICAP" && market.line > 0 ? `+${market.line}` : market.line;
  return <span className={`${LINE} block text-xs font-semibold tabular-nums text-fog`}>{v}</span>;
}

function Cells({ f, market, cols, started }: { f: UiFixture; market: UiMarket | undefined; cols: Tab["cols"]; started: boolean }) {
  const open = f.bettable && market?.status === "OPEN";
  return (
    <>
      {cols.map(([code]) => {
        const s = market?.selections.find((x) => x.code === code);
        return (
          <div key={code} className={CELL}>
            {open && s && s.status === "OPEN" ? (
              <OddsButton
                pick={{
                  selectionId: s.id,
                  fixtureId: f.id,
                  milliOdds: s.milliOdds,
                  selectionName: s.name,
                  marketName: market!.name,
                  fixtureName: `${f.homeTeam} v ${f.awayTeam}`,
                  score: liveScore(f),
                }}
              />
            ) : (
              <span aria-hidden className="flex h-10 items-center justify-center rounded-md border border-dashed border-line bg-ink-600/40 text-fog-muted">
                {started ? <LockIcon /> : "–"}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Team line; when a live refresh raises the score, the number pops (and football gets a GOAL burst). */
function Team({ name, logo, score, goal }: { name: string; logo: string | null; score: number | null; goal: boolean }) {
  const prev = useRef(score);
  const [scored, setScored] = useState(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = score;
    if (score === null || before === null || score <= before) return; // first paint or a correction: no celebration
    setScored(true);
    const t = setTimeout(() => setScored(false), 6000);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Crest name={name} src={logo} size="xs" />
      <span className="truncate text-sm font-semibold text-white transition group-hover:text-lime">{name}</span>
      {scored && goal && (
        <span role="status" className="kb-goal shrink-0 rounded bg-lime px-1.5 py-px font-display text-[10px] font-extrabold italic tracking-wider text-lime-ink">
          GOAL
        </span>
      )}
      {score !== null && <span className={`ml-auto pl-2 text-sm font-extrabold tabular-nums text-lime ${scored ? "kb-score-pop" : ""}`}>{score}</span>}
    </div>
  );
}

/** The red live badge; with a kick-off time it also shows the running match clock (e.g. 23', HT, 90+3'). */
export function LivePill({ startsAt, sportKey }: { startsAt?: string | Date; sportKey?: string } = {}) {
  const [now, setNow] = useState(0); // 0 until mounted: server and first client render both show "Live" (no hydration mismatch)
  useEffect(() => {
    if (!startsAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [startsAt]);
  const label = startsAt && now ? liveClockLabel(sportKey ?? "football", new Date(startsAt).getTime(), now) : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-danger">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-danger" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger" />
      </span>
      {label ?? "Live"}
    </span>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Closed">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
