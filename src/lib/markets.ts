/**
 * Single source of truth for "can this fixture take bets right now". Used by the bet
 * engine, booking codes and the UI so they can never disagree.
 *
 * Pre-match prices are synced on a schedule (hours apart on the free odds tier), so once a
 * match kicks off those prices are stale. Started fixtures are therefore closed unless
 * LIVE_BETTING=true, which should only be set with a real in-play odds feed. Even then a match in
 * play is only bettable while its odds were fetched within LIVE_ODDS_MAX_AGE_MS (the worker's live
 * odds refresh keeps them fresh); a score change clears that until odds fetched after it arrive.
 */
interface FixtureLike {
  status: string;
  startsAt: Date | string;
  oddsAt: Date | string | null;
}

export function isBettable(f: FixtureLike, now: Date = new Date()): boolean {
  if (f.status === "FINISHED" || f.status === "CANCELLED") return false;
  if (new Date(f.startsAt) > now) return true;
  if (process.env.LIVE_BETTING !== "true" || f.status !== "LIVE" || !f.oddsAt) return false;
  return now.getTime() - new Date(f.oddsAt).getTime() <= Number(process.env.LIVE_ODDS_MAX_AGE_MS ?? 90_000);
}

/** Football goal lines offered for over/under (main and extra), as on SportyBet: 1.5 to 5.5. */
export const FOOTBALL_TOTAL_LINES = [1.5, 2.5, 3.5, 4.5, 5.5];

/** Correct score: every score up to this many goals a side is its own pick; the rest is "Other". */
export const CORRECT_SCORE_MAX = 4;
