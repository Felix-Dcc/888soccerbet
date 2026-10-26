/**
 * Generated matches play themselves out. The admin pre-sets the half-time and full-time score; this
 * turns that into a timeline (goal minutes for football, a points ramp for basketball) and a worker
 * tick walks the live score forward in real time, then settles on the final whistle.
 *
 * Scoring is a pure function of the script and the minutes since kick-off, so every reader agrees
 * and a missed tick never loses a goal — the next tick lands on the right score.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { settleFixture } from "./settlement";

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

/** Whole match, kick-off to settlement, in real minutes. */
export const scriptLengthMin = (s: MatchScript) => s.fullMin + s.breakMin;

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

/** The score to show `elapsed` real minutes after kick-off, and whether the match is over. */
export function scoreAt(s: MatchScript, elapsed: number): { home: number; away: number; finished: boolean } {
  if (elapsed >= scriptLengthMin(s)) return { home: s.ft[0], away: s.ft[1], finished: true };
  // Real time -> minutes of play: the clock stops during the interval.
  const played =
    elapsed <= s.halfMin ? Math.max(0, elapsed)
    : elapsed <= s.halfMin + s.breakMin ? s.halfMin
    : s.halfMin + (elapsed - s.halfMin - s.breakMin);

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

/**
 * Walk every running generated match to the score its script says it should be on now, and settle
 * the ones that have finished. Safe to run as often as you like: it only writes on a change.
 */
export async function advanceScriptedMatches(now = new Date()): Promise<{ updated: number; settled: number }> {
  const running = await prisma.fixture.findMany({
    where: { providerRef: null, status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { lte: now }, script: { not: Prisma.DbNull } },
    select: { id: true, script: true, startsAt: true, homeScore: true, awayScore: true },
    take: 200,
  });
  let updated = 0;
  let settled = 0;
  for (const f of running) {
    const script = readScript(f.script);
    if (!script) continue;
    const elapsed = (now.getTime() - f.startsAt.getTime()) / 60_000;
    const { home, away, finished } = scoreAt(script, elapsed);
    try {
      if (finished) {
        await settleFixture(f.id, home, away); // final whistle: grade and pay out
        settled++;
      } else if (home !== f.homeScore || away !== f.awayScore) {
        // Guarded on status so a result an admin entered meanwhile is never overwritten.
        const r = await prisma.fixture.updateMany({ where: { id: f.id, status: { in: ["SCHEDULED", "LIVE"] } }, data: { homeScore: home, awayScore: away, status: "LIVE", lastSyncedAt: now } });
        updated += r.count;
      }
    } catch (e) {
      console.error(`[scripted] ${f.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { updated, settled };
}
