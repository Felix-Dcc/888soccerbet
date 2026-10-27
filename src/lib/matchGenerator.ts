/**
 * Builds a fictional match for the admin "Generate match" button: made-up teams, competition and
 * venue that exist in no real league, with sensible randomised odds across every market the manual
 * builder supports. The result is a plain ManualFixtureInput, so it goes through the same schema and
 * createManualFixture path as a hand-entered game — nothing here trusts the browser.
 */
import type { ManualFixtureInput } from "./validation";

type Sport = "football" | "basketball";

// Clearly invented names: an adjective + a creature/figure, so no combination is a real club.
const ADJECTIVES = ["Crimson", "Azure", "Golden", "Shadow", "Iron", "Silver", "Emerald", "Thunder", "Phantom", "Royal", "Mystic", "Savage", "Northern", "Wild", "Electric", "Granite", "Scarlet", "Cobalt", "Solar", "Frost"];
const NOUNS = ["Harriers", "Wanderers", "Sentinels", "Titans", "Falcons", "Mariners", "Rovers", "Phoenix", "Gladiators", "Nomads", "Vipers", "Comets", "Wolves", "Rangers", "Spartans", "Drifters", "Hawks", "Monarchs", "Raiders", "Pioneers"];
const FOOTBALL_COMPS = ["Kingz Exhibition Cup", "Nebula Invitational", "Phantom Trophy", "Galaxy Friendly Series", "Aurora Challenge Cup"];
const BASKETBALL_COMPS = ["Kingz Hoops Showcase", "Orbit Basketball Invitational", "Skyline Exhibition League"];
const VENUES = ["Horizon Arena", "Starfall Park", "Summit Grounds", "Lumen Stadium", "Crater Dome", "Meridian Field"];

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const range = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/**
 * Decimal odds from a win probability, with the house margin baked in (each outcome priced as if
 * `margin` times likelier, so a book's implied probabilities sum to ~1.08); clamped to a realistic band.
 */
export const oddsFrom = (prob: number, margin = 1.08) => Math.min(26, Math.max(1.08, Math.round((1 / (prob * margin)) * 100) / 100));

// Goals a side scores per 90 minutes in the in-play model (home, away): typical league rates.
const GOAL_RATE = [1.45, 1.15] as const;
const poisson = (mean: number, max = 12): number[] => {
  const p = [Math.exp(-mean)];
  for (let k = 1; k <= max; k++) p.push((p[k - 1]! * mean) / k);
  return p;
};

/** In-play decimal odds per market for a generated football match; null = decided or nearly so (suspend it). */
export interface InPlayOdds {
  result: { "1": number; X: number; "2": number } | null;
  total: { OVER: number; UNDER: number } | null;
  btts: { BTTS_YES: number; BTTS_NO: number } | null;
}

/**
 * In-play prices for a generated football match from what every viewer can see: the score and the
 * minutes of play left (plus the over/under market's own line). It must never be given the match's
 * script: the admin pre-sets the final score, and prices built from it would give the result away.
 * Remaining goals are Poisson at league-average rates. A market whose likeliest outcome is above 90%
 * is suspended: the 1.08 odds floor would otherwise pay more than it's worth.
 */
export function inPlayFootballOdds(home: number, away: number, minutesLeft: number, line: number | null, margin = 1.08): InPlayOdds {
  const t = Math.max(0, minutesLeft) / 90;
  const [ph, pa] = [poisson(GOAL_RATE[0] * t), poisson(GOAL_RATE[1] * t)];
  let [win, draw, loss, over, btts, mass] = [0, 0, 0, 0, 0, 0];
  ph.forEach((p1, i) =>
    pa.forEach((p2, j) => {
      const p = p1 * p2;
      const [h, a] = [home + i, away + j];
      mass += p;
      if (h > a) win += p;
      else if (h === a) draw += p;
      else loss += p;
      if (line !== null && h + a > line) over += p;
      if (h > 0 && a > 0) btts += p;
    }),
  );
  const price = (probs: number[]) => (Math.max(...probs) / mass > 0.9 ? null : probs.map((p) => oddsFrom(p / mass, margin)));
  const r = price([win, draw, loss]);
  const o = line !== null && line % 1 === 0.5 ? price([over, mass - over]) : null; // half lines only: no push to model
  const b = price([btts, mass - btts]);
  return {
    result: r && { "1": r[0]!, X: r[1]!, "2": r[2]! },
    total: o && { OVER: o[0]!, UNDER: o[1]! },
    btts: b && { BTTS_YES: b[0]!, BTTS_NO: b[1]! },
  };
}

/** Two distinct fictional team names. */
function twoTeams(): [string, string] {
  const name = () => `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  let home = name();
  let away = name();
  while (away === home) away = name();
  return [home, away];
}

/** Three result probabilities (home, draw, away) that sum to 1, each with a sane floor. */
function footballProbs(): [number, number, number] {
  const draw = range(0.2, 0.3);
  const rest = 1 - draw;
  const home = rest * range(0.42, 0.62); // home edge
  return [home, draw, rest - home];
}

export function generateMatch(sport: Sport = Math.random() < 0.8 ? "football" : "basketball"): ManualFixtureInput {
  const [homeTeam, awayTeam] = twoTeams();
  // Kick off 1.5–4 hours out, rounded to the next 5 minutes, so it sits in the upcoming list.
  const startsAtMs = Math.ceil((Date.now() + range(1.5, 4) * 3_600_000) / 300_000) * 300_000;
  const base = { homeTeam, awayTeam, venue: pick(VENUES), startsAt: new Date(startsAtMs).toISOString() };

  if (sport === "basketball") {
    const home = range(0.4, 0.62);
    const line = Math.round(range(195, 225)) + 0.5; // points total, always a half line
    const over = range(0.47, 0.53);
    return {
      sportKey: "basketball",
      competition: pick(BASKETBALL_COMPS),
      ...base,
      result: { home: oddsFrom(home), away: oddsFrom(1 - home) },
      total: { line, over: oddsFrom(over), under: oddsFrom(1 - over) },
    };
  }

  const [home, draw, away] = footballProbs();
  const line = pick([1.5, 2.5, 3.5]);
  const over = range(0.45, 0.6);
  const yes = range(0.48, 0.62);
  return {
    sportKey: "football",
    competition: pick(FOOTBALL_COMPS),
    ...base,
    result: { home: oddsFrom(home), draw: oddsFrom(draw), away: oddsFrom(away) },
    total: { line, over: oddsFrom(over), under: oddsFrom(1 - over) },
    btts: { yes: oddsFrom(yes), no: oddsFrom(1 - yes) },
  };
}

/** A plausible scoreline for a sport: half-time never ahead of full-time. */
export function generateScoreline(sport: Sport): { ht: [number, number]; ft: [number, number] } {
  if (sport === "basketball") {
    const total = () => 95 + Math.floor(Math.random() * 35);
    const [ftH, ftA] = [total(), total()];
    const half = (n: number) => Math.round(n * (0.45 + Math.random() * 0.1));
    return { ht: [half(ftH), half(ftA)], ft: [ftH, ftA] };
  }
  // Goals weighted the way football actually finishes: 0-2 common, 4 rare.
  const goals = () => {
    const r = Math.random();
    return r < 0.25 ? 0 : r < 0.55 ? 1 : r < 0.8 ? 2 : r < 0.93 ? 3 : 4;
  };
  const [ftH, ftA] = [goals(), goals()];
  const atHalf = (n: number) => Math.floor(Math.random() * (n + 1));
  return { ht: [atHalf(ftH), atHalf(ftA)], ft: [ftH, ftA] };
}
