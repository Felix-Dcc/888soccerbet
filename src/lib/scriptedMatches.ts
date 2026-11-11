/**
 * Generated matches play themselves out. The admin pre-sets the half-time and full-time score; this
 * turns that into a timeline (goal minutes for football, a points ramp for basketball) and a worker
 * tick walks the live score forward in real time, then settles on the final whistle.
 *
 * Scoring is a pure function of the script and the minutes since kick-off, so every reader agrees
 * and a missed tick never loses a goal — the next tick lands on the right score.
 */
import { Prisma, type MarketType } from "@prisma/client";
import { prisma } from "./db";
import { settleFixture } from "./settlement";
import { bookMarket, inPlayFootballOdds } from "./matchGenerator";
import { toMilliOdds } from "./money";
import { stoppageFor } from "./liveClock";

export type Side = "H" | "A";
export interface MatchScript {
  ht: [number, number]; // half-time score
  ft: [number, number]; // full-time score
  halfMin: number; // minutes of play in a half
  breakMin: number; // real minutes the interval lasts
  fullMin: number; // minutes of play in the match
  goals: { m: number; side: Side }[]; // football only; basketball ramps instead
}

/** Football runs 45+45 with a 15-minute interval; basketball 24+24 with 10. Real minutes throughout. */
const TIMING = {
  football: { halfMin: 45, breakMin: 15, fullMin: 90 },
  basketball: { halfMin: 24, breakMin: 10, fullMin: 48 },
} as const;

// Real stoppage minutes added to each half (football only, keyed off its full-time length): the same
// per-match figures the on-screen clock uses, so the clock and the score/settlement never drift apart.
const addedTime = (s: { fullMin: number }, startsAtMs: number) => stoppageFor(s.fullMin === TIMING.football.fullMin ? "football" : "basketball", startsAtMs);

/** Whole match, kick-off to settlement, in real minutes (both halves' stoppage and the interval included). */
export const scriptLengthMin = (s: MatchScript, startsAtMs: number) => {
  const st = addedTime(s, startsAtMs);
  return s.fullMin + s.breakMin + st.add1 + st.add2;
};

const spread = (count: number, from: number, to: number): number[] =>
  Array.from({ length: count }, () => from + Math.floor(Math.random() * Math.max(1, to - from + 1)));

/** Build the timeline for a scoreline. Throws if full time is behind half time (nobody un-scores). */
export function buildScript(sport: "football" | "basketball", ht: [number, number], ft: [number, number]): MatchScript {
  if (ft[0] < ht[0] || ft[1] < ht[1]) throw new Error("The final score can't be lower than the half-time score");
  const t = TIMING[sport];
  const goals: { m: number; side: Side }[] = [];
  if (sport === "football") {
    // First-half goals land before the interval, second-half ones after it, so the score is right at both anchors.
    for (const [side, n] of [["H", ht[0]], ["A", ht[1]]] as const) for (const m of spread(n, 1, t.halfMin)) goals.push({ m, side });
    for (const [side, n] of [["H", ft[0] - ht[0]], ["A", ft[1] - ht[1]]] as const)
      for (const m of spread(n, t.halfMin + 1, t.fullMin)) goals.push({ m, side });
    goals.sort((a, b) => a.m - b.m);
  }
  return { ht, ft, halfMin: t.halfMin, breakMin: t.breakMin, fullMin: t.fullMin, goals };
}

const lerp = (from: number, to: number, t: number) => Math.round(from + (to - from) * Math.min(1, Math.max(0, t)));

/** Real minutes since kick-off -> minutes of play: the clock stops during first-half stoppage and the interval. */
const playedMin = (t: { halfMin: number; breakMin: number; fullMin: number }, elapsed: number, startsAtMs: number) => {
  const breakEnd = t.halfMin + addedTime(t, startsAtMs).add1 + t.breakMin; // play resumes after stoppage + interval
  return elapsed <= t.halfMin ? Math.max(0, elapsed)
    : elapsed <= breakEnd ? t.halfMin // all first-half goals are in; score holds through stoppage and the break
    : Math.min(t.fullMin, t.halfMin + (elapsed - breakEnd)); // second half; holds at full once play reaches 90
};

/** The score to show `elapsed` real minutes after kick-off, and whether the match is over. */
export function scoreAt(s: MatchScript, elapsed: number, startsAtMs: number): { home: number; away: number; finished: boolean } {
  if (elapsed >= scriptLengthMin(s, startsAtMs)) return { home: s.ft[0], away: s.ft[1], finished: true };
  const played = playedMin(s, elapsed, startsAtMs);

  if (s.goals.length || (s.ft[0] === 0 && s.ft[1] === 0))
    return { home: s.goals.filter((g) => g.side === "H" && g.m <= played).length, away: s.goals.filter((g) => g.side === "A" && g.m <= played).length, finished: false };

  // Basketball: points climb steadily, with the half-time score as the mid-point anchor.
  if (played <= s.halfMin) {
    const t = s.halfMin ? played / s.halfMin : 1;
    return { home: lerp(0, s.ht[0], t), away: lerp(0, s.ht[1], t), finished: false };
  }
  const t = (played - s.halfMin) / Math.max(1, s.fullMin - s.halfMin);
  return { home: lerp(s.ht[0], s.ft[0], t), away: lerp(s.ht[1], s.ft[1], t), finished: false };
}

const isScript = (v: unknown): v is MatchScript => {
  const s = v as MatchScript | null;
  return !!s && Array.isArray(s.ht) && Array.isArray(s.ft) && typeof s.halfMin === "number" && typeof s.fullMin === "number" && Array.isArray(s.goals);
};

/** Read a fixture's stored script, or null when it has none (every feed and hand-entered game). */
export const readScript = (v: Prisma.JsonValue | null | undefined): MatchScript | null => (isScript(v) ? v : null);

// After a goal a generated match's markets stay suspended this long before they reopen at new prices.
const GOAL_SUSPEND_MS = 10_000;
// Refresh the in-play freshness stamp this often (well inside LIVE_ODDS_MAX_AGE_MS) without making
// players' pages reload on every tick.
const STAMP_EVERY_MS = 30_000;

type Running = Prisma.FixtureGetPayload<{ select: typeof runningSelect }>;
const runningSelect = {
  id: true, sportKey: true, script: true, startsAt: true, status: true, homeScore: true, awayScore: true, oddsAt: true, scoreChangedAt: true,
} satisfies Prisma.FixtureSelect;

/**
 * Reprice a generated football match in play from its score and the minutes left only (never its
 * script, see inPlayFootballOdds), and stamp oddsAt so it can take live bets (isBettable).
 */
async function priceInPlay(f: Running, home: number, away: number, elapsed: number, now: Date) {
  const t = TIMING.football;
  const left = Math.round(t.fullMin - playedMin(t, elapsed, f.startsAt.getTime())); // whole minutes: prices move once a minute
  const markets = await prisma.market.findMany({
    where: { fixtureId: f.id },
    select: { id: true, type: true, line: true, status: true, selections: { select: { id: true, code: true, milliOdds: true, status: true } } },
  });
  const lineOf = (type: MarketType) => {
    const line = markets.find((m) => m.type === type)?.line;
    return line == null ? null : Number(line);
  };
  // The match's own main lines keep their market types; the rest are the alternates it was built with.
  const book = inPlayFootballOdds(home, away, left, { total: lineOf("OVER_UNDER"), handicap: lineOf("HANDICAP") });
  for (const m of markets) {
    if (m.status === "SETTLED") continue;
    const picks = bookMarket(book, m.type, m.line == null ? null : Number(m.line))?.picks;
    // Nothing left to offer (both teams have scored, the line is already beaten): close the market.
    if (!picks || Object.values(picks).every((o) => o === null)) {
      if (m.status === "OPEN") await prisma.market.update({ where: { id: m.id }, data: { status: "SUSPENDED" } });
      continue;
    }
    for (const s of m.selections) {
      // A pick the score has ruled out (e.g. 0-0 once it's 1-0) closes instead of staying at long odds.
      const o = picks[s.code] ?? null;
      const data = o === null ? { status: "SUSPENDED" as const } : { status: "OPEN" as const, milliOdds: toMilliOdds(o) };
      if (data.status !== s.status || ("milliOdds" in data && data.milliOdds !== s.milliOdds)) await prisma.selection.update({ where: { id: s.id }, data });
    }
    if (m.status !== "OPEN") await prisma.market.update({ where: { id: m.id }, data: { status: "OPEN" } });
  }
  if (!f.oddsAt || now.getTime() - f.oddsAt.getTime() >= STAMP_EVERY_MS) await prisma.fixture.update({ where: { id: f.id }, data: { oddsAt: now } });
}

/**
 * Walk every running generated match to the score its script says it should be on now, and settle
 * the ones that have finished. Safe to run as often as you like: it only writes on a change.
 * Generated football matches are priced in play from kick-off: a goal suspends every market for
 * GOAL_SUSPEND_MS, then they reopen at prices for the new score.
 */
export async function advanceScriptedMatches(now = new Date()): Promise<{ updated: number; settled: number }> {
  const running = await prisma.fixture.findMany({
    where: { providerRef: null, status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { lte: now }, script: { not: Prisma.DbNull } },
    select: runningSelect,
    take: 200,
  });
  let updated = 0;
  let settled = 0;
  for (const f of running) {
    const script = readScript(f.script);
    if (!script) continue;
    const elapsed = (now.getTime() - f.startsAt.getTime()) / 60_000;
    const { home, away, finished } = scoreAt(script, elapsed, f.startsAt.getTime());
    try {
      if (finished) {
        await settleFixture(f.id, home, away); // final whistle: grade and pay out
        settled++;
      } else {
        let goal = false;
        if (home !== f.homeScore || away !== f.awayScore) {
          goal = home !== (f.homeScore ?? 0) || away !== (f.awayScore ?? 0); // kick-off (no score -> 0-0) isn't one
          // Guarded on status so a result an admin entered meanwhile is never overwritten. Clearing
          // oddsAt closes live bets at once; the markets are then suspended until the next pricing.
          const r = await prisma.fixture.updateMany({
            where: { id: f.id, status: { in: ["SCHEDULED", "LIVE"] } },
            data: { homeScore: home, awayScore: away, status: "LIVE", lastSyncedAt: now, ...(goal && { scoreChangedAt: now, oddsAt: null }) },
          });
          if (goal && r.count) await prisma.market.updateMany({ where: { fixtureId: f.id, status: "OPEN" }, data: { status: "SUSPENDED" } });
          updated += r.count;
          if (!r.count) continue;
        }
        // Priced from kick-off (0-0 included) and again once a goal's suspension has passed. Basketball
        // scores ramp toward the pre-set final, so it is never priced in play.
        if (!goal && f.sportKey === "football" && (!f.scoreChangedAt || now.getTime() - f.scoreChangedAt.getTime() >= GOAL_SUSPEND_MS))
          await priceInPlay(f, home, away, elapsed, now);
      }
    } catch (e) {
      console.error(`[scripted] ${f.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { updated, settled };
}
