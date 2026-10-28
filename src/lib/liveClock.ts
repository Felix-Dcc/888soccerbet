/**
 * The match clock for a generated game, as a pure function of real minutes since kick-off.
 * It runs on screen (ticking) and also sets how long each match stays live, so these stoppage
 * lengths are the single source of truth — scriptedMatches.ts reads them too.
 */
export type ClockSport = "football" | "basketball";

// Real minutes of play per half (reg), interval (brk), and stoppage added to each half (add1/add2).
// Football gets a short stoppage so the clock shows 45+ and 90+ like a real game; basketball runs straight.
export const MATCH_TIMING: Record<ClockSport, { reg: number; brk: number; add1: number; add2: number }> = {
  football: { reg: 45, brk: 15, add1: 2, add2: 4 }, // stoppage kept under 5 minutes a half
  basketball: { reg: 24, brk: 10, add1: 0, add2: 0 },
};

const timingFor = (sport: string): (typeof MATCH_TIMING)["football"] => (sport === "basketball" ? MATCH_TIMING.basketball : MATCH_TIMING.football);

/** Total real minutes from kick-off to the final whistle, stoppage and the interval included. */
export const matchRealMinutes = (sport: string): number => {
  const t = timingFor(sport);
  return t.reg + t.add1 + t.brk + t.reg + t.add2;
};

/** "23'", "45+2'", "HT", "67'", "90+3'" while the match is live; null before kick-off and once it is over. */
export function liveClockLabel(sport: string, startsAtMs: number, nowMs: number): string | null {
  const t = timingFor(sport);
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
