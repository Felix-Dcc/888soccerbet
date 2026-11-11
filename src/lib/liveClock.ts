/**
 * The match clock for a generated game, as a pure function of real minutes since kick-off.
 * It runs on screen (ticking) and also sets how long each match stays live, so these stoppage
 * lengths are the single source of truth — scriptedMatches.ts reads them too.
 */
export type ClockSport = "football" | "basketball";

// Real minutes of play per half (reg) and the interval (brk). Added time is per match: see stoppageFor.
export const MATCH_TIMING: Record<ClockSport, { reg: number; brk: number }> = {
  football: { reg: 45, brk: 15 },
  basketball: { reg: 24, brk: 10 },
};

/** Most added time a half can get, in minutes. */
export const MAX_STOPPAGE_MIN = 7;

/**
 * Added time for one match: football gets 1–7 minutes at the end of each half (never more than 7),
 * basketball none. Worked out from the kick-off time, so it differs from match to match yet every page,
 * the live score and settlement agree on it without storing anything.
 */
export function stoppageFor(sport: string, startsAtMs: number): { add1: number; add2: number } {
  if (sport === "basketball") return { add1: 0, add2: 0 };
  let h = Math.floor(startsAtMs / 60_000) >>> 0; // kick-off minute
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return { add1: 1 + (h % MAX_STOPPAGE_MIN), add2: 1 + (Math.floor(h / MAX_STOPPAGE_MIN) % MAX_STOPPAGE_MIN) };
}

const timingFor = (sport: string, startsAtMs: number) => ({
  ...(sport === "basketball" ? MATCH_TIMING.basketball : MATCH_TIMING.football),
  ...stoppageFor(sport, startsAtMs),
});

/** Total real minutes from kick-off to the final whistle, stoppage and the interval included. */
export const matchRealMinutes = (sport: string, startsAtMs: number): number => {
  const t = timingFor(sport, startsAtMs);
  return t.reg + t.add1 + t.brk + t.reg + t.add2;
};

/** "23'", "45+2'", "HT", "67'", "90+3'" while the match is live; null before kick-off and once it is over. */
export function liveClockLabel(sport: string, startsAtMs: number, nowMs: number): string | null {
  const t = timingFor(sport, startsAtMs);
  const e = (nowMs - startsAtMs) / 60_000;
  if (e < 0) return null;
  const firstEnd = t.reg + t.add1; // end of first half, stoppage included
  const breakEnd = firstEnd + t.brk; // end of the interval
  const secondEnd = breakEnd + t.reg + t.add2; // final whistle
  if (e >= secondEnd) return null; // finished
  if (e < t.reg) return `${Math.max(1, Math.ceil(e))}'`; // 1..reg
  if (e < firstEnd) return `${t.reg}+${Math.max(1, Math.ceil(e - t.reg))}'`; // reg+stoppage
  if (e < breakEnd) return "HT"; // interval
  if (e < breakEnd + t.reg) return `${t.reg + Math.max(1, Math.ceil(e - breakEnd))}'`; // reg+1..2*reg
  return `${2 * t.reg}+${Math.max(1, Math.ceil(e - breakEnd - t.reg))}'`; // 2*reg + stoppage
}
