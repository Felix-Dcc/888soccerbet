import Link from "next/link";
import { BallOrbit } from "@/components/BallOrbit";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatMilliOdds, formatPesewas } from "@/lib/money";
import { formatStamp, kickoffShortDate, kickoffTime } from "@/lib/time";
import { SignedOut } from "@/components/SignedOut";
import { SportIcon } from "@/components/SportIcon";
import { ticketTotals } from "@/lib/tickets";
import { quotesFor, partialLimit } from "@/lib/cashout";
import { CashoutPanel } from "@/components/CashoutPanel";
import { LegClock } from "@/components/LegClock";

export const dynamic = "force-dynamic";

/** Open filters: everything, what can be cashed out right now, what's being played right now. */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "cashout", label: "Cashout Available" },
  { key: "live", label: "Live Games" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

/** Settled-bet badge. Win is teal, loss red. */
const OUTCOME: Record<string, { pill: string; label: string }> = {
  WON: { pill: "bg-teal/15 text-teal", label: "Won" },
  LOST: { pill: "bg-danger/15 text-danger", label: "Lost" },
  VOID: { pill: "bg-ink-500 text-fog", label: "Void" },
  REJECTED: { pill: "bg-ink-500 text-fog", label: "Rejected" },
};

type LegFixture = { startsAt: Date; status: string; homeScore: number | null; awayScore: number | null; sportKey: string };
type LegState = "upcoming" | "live" | "WON" | "LOST" | "VOID" | "over";

/** A match this long past kick-off without a result is waiting on it, not in play (as on match lists). */
const PLAY_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Where a leg stands: settled legs by their result, open ones by their match clock. */
function legState(status: string, f: LegFixture, now: Date): LegState {
  if (status === "WON" || status === "LOST" || status === "VOID") return status;
  if (f.status === "FINISHED" || f.status === "CANCELLED") return "over";
  if (f.startsAt > now) return "upcoming";
  return now.getTime() - f.startsAt.getTime() < PLAY_WINDOW_MS ? "live" : "over";
}

/**
 * My bets, laid out like a sportsbook's bet list: a white band with the title and two tabs
 * (open bets / history), quick filters for open bets, then each bet as a card listing every
 * pick (selection @ odds, market, match, kick-off or score), its stake and potential win, and
 * cash out when it's offered.
 */
export default async function BetsPage({ searchParams }: { searchParams: Promise<{ tab?: string; f?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <SignedOut title="My bets" />;
  const sp = await searchParams;
  // "settled" / "unsettled" are the older tab names other pages still link to.
  const history = sp.tab === "history" || sp.tab === "settled";
  const filter: Filter = FILTERS.find((x) => x.key === sp.f)?.key ?? "all";
  const now = new Date();

  const [bets, openCount] = await Promise.all([
    prisma.bet.findMany({
      where: { userId: user.id, status: history ? { not: "PENDING" } : "PENDING" },
      orderBy: { placedAt: "desc" },
      take: 50,
      include: {
        selections: {
          select: {
            fixtureId: true,
            fixtureName: true,
            selectionName: true,
            marketName: true,
            milliOddsAtPlacement: true,
            status: true,
            fixture: { select: { startsAt: true, status: true, homeScore: true, awayScore: true, sportKey: true } },
          },
        },
        cashouts: { select: { amount: true, stakePortion: true, full: true } },
      },
    }),
    prisma.bet.count({ where: { userId: user.id, status: "PENDING" } }),
  ]);
  const quotes = await quotesFor(history ? [] : bets.map((b) => b.id));
  const shown = bets.filter((b) =>
    filter === "cashout" ? !!quotes.get(b.id)?.available : filter === "live" ? b.selections.some((s) => legState(s.status, s.fixture, now) === "live") : true,
  );

  const tabCls = (on: boolean) =>
    `-mb-px flex-1 border-b-2 px-3 py-3 text-center text-[15px] font-semibold transition-colors ${on ? "border-lime text-white" : "border-transparent text-fog hover:text-white"}`;

  return (
    <div className="space-y-4">
      {/* White band: the title, then the two tabs underlined in green when active. */}
      <div className="-mx-4 -mt-5 border-b border-line bg-ink-800 px-4 pt-4 sm:mx-0 sm:mt-0 sm:rounded-t-xl sm:border sm:border-b-line">
        <h1 className="pb-2 font-display text-lg font-extrabold text-white">My Bets</h1>
        <nav aria-label="Bets" className="flex gap-2">
          <Link href="/bets" aria-current={!history ? "page" : undefined} className={tabCls(!history)}>
            Open Bets ({openCount})
          </Link>
          <Link href="/bets?tab=history" aria-current={history ? "page" : undefined} className={tabCls(history)}>
            Bet History
          </Link>
        </nav>
      </div>

      {!history && (
        <nav aria-label="Filter open bets" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {FILTERS.map((x) => {
            const on = x.key === filter;
            return (
              <Link
                key={x.key}
                href={x.key === "all" ? "/bets" : `/bets?f=${x.key}`}
                aria-current={on ? "page" : undefined}
                className={`shrink-0 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${on ? "bg-white text-ink-900" : "bg-ink-600 text-fog hover:text-white"}`}
              >
                {x.label}
              </Link>
            );
          })}
        </nav>
      )}

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 p-10 text-center">
          <BallOrbit className="h-24 w-24" />
          <div>
            <p className="font-semibold text-white">
              {history ? "No settled bets yet" : filter === "cashout" ? "No bets can be cashed out right now" : filter === "live" ? "None of your matches are in play" : "No open bets"}
            </p>
            <p className="mt-1 text-sm text-fog-muted">Pick a price on any match to start a slip.</p>
          </div>
          <Link href="/" className="btn-lime px-5 py-2 text-sm">
            Browse matches
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((b) => {
            const { ret, placedStake } = ticketTotals(b);
            const q = quotes.get(b.id);
            const cashedOut = b.status === "WON" && b.cashouts.some((c) => c.full); // a full cash out settles as WON
            const outcome = cashedOut ? { pill: "bg-teal/15 text-teal", label: "Cashed out" } : OUTCOME[b.status];
            return (
              <li key={b.id} className="card overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-4">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-extrabold text-white">{b.type === "ACCUMULATOR" ? "Multiple" : "Single"}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-fog-muted">
                      {formatStamp(b.placedAt)} · {b.ref}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {outcome && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${outcome.pill}`}>{outcome.label}</span>}
                    <Link href={`/bets/${b.ref}`} className="text-sm font-semibold text-lime hover:underline">
                      Details ›
                    </Link>
                  </div>
                </div>

                <ul className="divide-y divide-line px-4">
                  {b.selections.map((s, i) => {
                    const state = legState(s.status, s.fixture, now);
                    const [home, away] = s.fixtureName.split(" v ");
                    const scored = s.fixture.homeScore !== null || s.fixture.awayScore !== null;
                    const score = `${s.fixture.homeScore ?? 0} : ${s.fixture.awayScore ?? 0}`;
                    return (
                      <li key={i} className="flex gap-3 py-3.5">
                        <LegIcon state={state} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <SportIcon sport={s.fixture.sportKey} className="h-4 w-4 shrink-0 text-white" />
                            <span className="font-bold text-white">
                              {s.selectionName} @ <span className="tabular-nums">{formatMilliOdds(s.milliOddsAtPlacement)}</span>
                            </span>
                            <span className="text-sm text-fog-muted">{s.marketName}</span>
                          </div>
                          <Link href={`/fixture/${s.fixtureId}`} className="mt-1 block truncate text-sm text-white hover:text-lime">
                            {away !== undefined ? (
                              <>
                                <span className="underline decoration-ink-400 underline-offset-4">{home}</span> <span className="text-fog-muted">vs</span>{" "}
                                <span className="underline decoration-ink-400 underline-offset-4">{away}</span>
                              </>
                            ) : (
                              <span className="underline decoration-ink-400 underline-offset-4">{s.fixtureName}</span>
                            )}
                          </Link>
                          <div className="mt-1 text-xs tabular-nums text-fog-muted">
                            {state === "live" ? (
                              <LegClock startsAt={s.fixture.startsAt.toISOString()} sportKey={s.fixture.sportKey} home={s.fixture.homeScore} away={s.fixture.awayScore} />
                            ) : state === "upcoming" ? (
                              `${kickoffShortDate(s.fixture.startsAt.toISOString())} ${kickoffTime(s.fixture.startsAt.toISOString())}`
                            ) : s.fixture.status === "CANCELLED" ? (
                              "Match void"
                            ) : s.fixture.status === "FINISHED" ? (
                              `FT · ${kickoffShortDate(s.fixture.startsAt.toISOString())}`
                            ) : (
                              "Awaiting result"
                            )}
                          </div>
                        </div>
                        {/* Live picks show the score beside the clock instead. */}
                        {scored && state !== "upcoming" && state !== "live" && (
                          <span className="self-center rounded-md bg-ink-600 px-2 py-1 text-sm font-extrabold tabular-nums text-white" aria-label={`Score ${score}`}>
                            {score}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <dl className="space-y-1.5 border-t border-line px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <dt className="text-fog">Stake</dt>
                    <dd className="text-lg font-extrabold tabular-nums text-white">{formatPesewas(placedStake)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-fog">{ret === null ? "Pot. Win" : "Return"}</dt>
                    <dd className={`text-lg font-extrabold tabular-nums ${b.status === "WON" ? "text-teal" : "text-white"}`}>{formatPesewas(ret ?? b.potentialPayout)}</dd>
                  </div>
                </dl>
                {q && (
                  <div className="px-4 pb-4">
                    <CashoutPanel
                      betRef={b.ref}
                      quote={q.available ? { available: true, offer: q.offer.toString() } : { available: false, reason: q.reason }}
                      auto={null}
                      partialsLeft={partialLimit(b.type) - b.cashouts.filter((c) => !c.full).length}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The mark beside each pick: a clock before kick-off, a pulse in play, then the leg's result. */
function LegIcon({ state }: { state: LegState }) {
  const box = "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full";
  if (state === "live")
    return (
      <span className={box} aria-label="In play">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
      </span>
    );
  if (state === "WON" || state === "LOST")
    return (
      <span className={`${box} ${state === "WON" ? "bg-teal/15 text-teal" : "bg-danger/15 text-danger"}`} aria-label={state === "WON" ? "Won" : "Lost"}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={state === "WON" ? "M5 12l5 5L20 7" : "M6 6l12 12M18 6 6 18"} />
        </svg>
      </span>
    );
  if (state === "VOID" || state === "over")
    return (
      <span className={`${box} bg-ink-600 text-fog`} aria-label={state === "VOID" ? "Void" : "Awaiting result"}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
          <path d="M7 12h10" />
        </svg>
      </span>
    );
  return (
    <span className={`${box} text-fog`} aria-label="Not started">
      <SportIcon sport="clock" className="h-6 w-6" />
    </span>
  );
}
