import type { MarketType } from "@prisma/client";

/**
 * Single source of truth for "can this fixture take bets right now". Used by the bet
 * engine, booking codes and the UI so they can never disagree.
 *
 * Pre-match prices are synced on a schedule, so once a match kicks off those prices are stale. A
 * match in play is only bettable while its in-play prices were set within LIVE_ODDS_MAX_AGE_MS
 * (oddsAt); a score change clears that until prices set after it arrive. Only two writers set
 * oddsAt, so only these matches can ever take live bets: feed matches in LIVE_BETTING_LEAGUES, and
 * only while LIVE_BETTING=true (lib/sync.ts), and generated football matches, always priced
 * locally from the score (lib/scriptedMatches.ts).
 */
interface FixtureLike {
  status: string;
  startsAt: Date | string;
  oddsAt: Date | string | null;
}

export function isBettable(f: FixtureLike, now: Date = new Date()): boolean {
  if (f.status === "FINISHED" || f.status === "CANCELLED") return false;
  if (new Date(f.startsAt) > now) return true;
  if (f.status !== "LIVE" || !f.oddsAt) return false;
  return now.getTime() - new Date(f.oddsAt).getTime() <= Number(process.env.LIVE_ODDS_MAX_AGE_MS ?? 90_000);
}

/** The score to show with a pick while its match is in play (0-0 from kick-off), else null. */
export const liveScore = (f: { status: string; homeScore: number | null; awayScore: number | null }) =>
  f.status === "LIVE" ? { home: f.homeScore ?? 0, away: f.awayScore ?? 0 } : null;

/** Feed leagues (provider keys) that take in-play bets: LIVE_BETTING_LEAGUES, default the EPL. None while LIVE_BETTING is off. */
export const liveBettingLeagues = (): string[] =>
  process.env.LIVE_BETTING !== "true" ? [] : (process.env.LIVE_BETTING_LEAGUES ?? "soccer_epl").split(",").map((s) => s.trim()).filter(Boolean);

/** Feed markets offered in play: the match result only. Everything else closes at kick-off. */
export const IN_PLAY_MARKET_TYPES: MarketType[] = ["MATCH_RESULT", "MONEYLINE"];

/** Football goal lines offered for over/under (main and extra), as on SportyBet: 1.5 to 5.5. */
export const FOOTBALL_TOTAL_LINES = [1.5, 2.5, 3.5, 4.5, 5.5];

/** Correct score: every score up to this many goals a side is its own pick; the rest is "Other". */
export const CORRECT_SCORE_MAX = 4;
