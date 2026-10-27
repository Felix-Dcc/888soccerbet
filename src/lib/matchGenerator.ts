/**
 * Builds a fictional match for the admin "Generate match" button: made-up teams, competition and
 * venue that exist in no real league, with sensible randomised odds across every market the manual
 * builder supports. The result is a plain ManualFixtureInput, so it goes through the same schema and
 * createManualFixture path as a hand-entered game — nothing here trusts the browser.
 */
import type { MarketType } from "@prisma/client";
import type { ManualFixtureInput } from "./validation";
import { CORRECT_SCORE_MAX } from "./markets";

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

/** Probability of each pick, by market type and selection code (the codes settlement grades). */
export type BookProbs = Partial<Record<MarketType, Record<string, number>>>;
/** Decimal odds by market type and code. A null market or pick is decided or nearly so: suspend it. */
export type Book = Partial<Record<MarketType, Record<string, number | null> | null>>;

/**
 * Every football market from ONE scoreline model: the current score plus Poisson goals still to
 * come, `meanH`/`meanA` each. One distribution behind every price keeps the book coherent: priced
 * below it, no set of picks across markets can win in every outcome. Draw no bet is the win
 * chance given no draw (a draw refunds the stake). Outcomes the score has ruled out get 0.
 */
export function footballMarketProbs(home: number, away: number, meanH: number, meanA: number, line: number | null): BookProbs {
  const [ph, pa] = [poisson(meanH), poisson(meanA)];
  const cs: Record<string, number> = { OTHER: 0 };
  for (let h = 0; h <= CORRECT_SCORE_MAX; h++) for (let a = 0; a <= CORRECT_SCORE_MAX; a++) cs[`${h}-${a}`] = 0;
  let [win, draw, loss, over, btts, odd, mass] = [0, 0, 0, 0, 0, 0, 0];
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
      if ((h + a) % 2) odd += p;
      cs[h > CORRECT_SCORE_MAX || a > CORRECT_SCORE_MAX ? "OTHER" : `${h}-${a}`]! += p;
    }),
  );
  const n = (p: number) => p / mass;
  return {
    MATCH_RESULT: { "1": n(win), X: n(draw), "2": n(loss) },
    ...(line !== null && line % 1 === 0.5 && { OVER_UNDER: { OVER: n(over), UNDER: n(mass - over) } }), // half lines: no push to model
    BTTS: { BTTS_YES: n(btts), BTTS_NO: n(mass - btts) },
    DOUBLE_CHANCE: { "1X": n(win + draw), "12": n(win + loss), X2: n(draw + loss) },
    ...(win + loss > 0 && { DRAW_NO_BET: { "1": win / (win + loss), "2": loss / (win + loss) } }),
    ODD_EVEN: { ODD: n(odd), EVEN: n(mass - odd) },
    CORRECT_SCORE: Object.fromEntries(Object.entries(cs).map(([code, p]) => [code, n(p)])),
  };
}

/**
 * Prices with the house margin (oddsFrom). A market whose likeliest pick is above 90% is suspended:
 * the 1.08 odds floor would otherwise pay more than the pick is worth. A pick that can no longer
 * win (probability 0) is suspended rather than offered at long odds.
 */
export function priceBook(probs: BookProbs, margin = 1.08): Book {
  return Object.fromEntries(
    Object.entries(probs).map(([type, picks]) => [
      type,
      Math.max(...Object.values(picks)) > 0.9 ? null : Object.fromEntries(Object.entries(picks).map(([code, p]) => [code, p > 0 ? oddsFrom(p, margin) : null])),
    ]),
  );
}

/**
 * In-play prices for a generated football match from what every viewer can see: the score and the
 * minutes of play left (plus the over/under market's own line). It must never be given the match's
 * script: the admin pre-sets the final score, and prices built from it would give the result away.
 * Remaining goals come at league-average rates.
 */
export function inPlayFootballOdds(home: number, away: number, minutesLeft: number, line: number | null, margin = 1.08): Book {
  const t = Math.max(0, minutesLeft) / 90;
  return priceBook(footballMarketProbs(home, away, GOAL_RATE[0] * t, GOAL_RATE[1] * t, line), margin);
}

/** Two distinct fictional team names. */
function twoTeams(): [string, string] {
  const name = () => `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  let home = name();
  let away = name();
  while (away === home) away = name();
  return [home, away];
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
      oddEven: { odd: oddsFrom(0.5), even: oddsFrom(0.5) },
    };
  }

  // Each side's expected goals (home edge built in): every market is priced from these, so the
  // book is coherent (see footballMarketProbs). The goal line is the one closest to even money.
  const [meanH, meanA] = [range(1.0, 1.9), range(0.6, 1.5)];
  const line = [1.5, 2.5, 3.5].reduce((best, l) =>
    Math.abs(footballMarketProbs(0, 0, meanH, meanA, l).OVER_UNDER!.OVER! - 0.5) < Math.abs(footballMarketProbs(0, 0, meanH, meanA, best).OVER_UNDER!.OVER! - 0.5) ? l : best,
  );
  const book = priceBook(footballMarketProbs(0, 0, meanH, meanA, line));
  // These ranges keep every market under the 90% cut-off before kick-off, so none is null here.
  const m = (t: MarketType) => book[t] as Record<string, number>;
  return {
    sportKey: "football",
    competition: pick(FOOTBALL_COMPS),
    ...base,
    result: { home: m("MATCH_RESULT")["1"]!, draw: m("MATCH_RESULT").X!, away: m("MATCH_RESULT")["2"]! },
    total: { line, over: m("OVER_UNDER").OVER!, under: m("OVER_UNDER").UNDER! },
    btts: { yes: m("BTTS").BTTS_YES!, no: m("BTTS").BTTS_NO! },
    doubleChance: { homeDraw: m("DOUBLE_CHANCE")["1X"]!, homeAway: m("DOUBLE_CHANCE")["12"]!, drawAway: m("DOUBLE_CHANCE").X2! },
    drawNoBet: { home: m("DRAW_NO_BET")["1"]!, away: m("DRAW_NO_BET")["2"]! },
    oddEven: { odd: m("ODD_EVEN").ODD!, even: m("ODD_EVEN").EVEN! },
    correctScore: m("CORRECT_SCORE"),
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
