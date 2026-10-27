/**
 * Builds a fictional match for the admin "Generate match" button: made-up teams, competition and
 * venue that exist in no real league, with sensible randomised odds across every market the manual
 * builder supports. The result is a plain ManualFixtureInput, so it goes through the same schema and
 * createManualFixture path as a hand-entered game — nothing here trusts the browser.
 */
import type { MarketType } from "@prisma/client";
import type { ManualFixtureInput } from "./validation";
import { CORRECT_SCORE_MAX, FOOTBALL_TOTAL_LINES } from "./markets";

type Sport = "football" | "basketball";

// Clearly invented names: an adjective + a creature/figure, so no combination is a real club.
const ADJECTIVES = ["Crimson", "Azure", "Golden", "Shadow", "Iron", "Silver", "Emerald", "Thunder", "Phantom", "Royal", "Mystic", "Savage", "Northern", "Wild", "Electric", "Granite", "Scarlet", "Cobalt", "Solar", "Frost"];
const NOUNS = ["Harriers", "Wanderers", "Sentinels", "Titans", "Falcons", "Mariners", "Rovers", "Phoenix", "Gladiators", "Nomads", "Vipers", "Comets", "Wolves", "Rangers", "Spartans", "Drifters", "Hawks", "Monarchs", "Raiders", "Pioneers"];
const FOOTBALL_COMPS = ["Kingz Exhibition Cup", "Nebula Invitational", "Phantom Trophy", "Galaxy Friendly Series", "Aurora Challenge Cup"];
const BASKETBALL_COMPS = ["Kingz Hoops Showcase", "Orbit Basketball Invitational", "Skyline Exhibition League"];
const VENUES = ["Horizon Arena", "Starfall Park", "Summit Grounds", "Lumen Stadium", "Crater Dome", "Meridian Field"];

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const range = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** The shortest and longest price offered: 1.01 is the lowest the manual-game schema accepts. */
const MIN_ODDS = 1.01;
const MAX_ODDS = 26;
/**
 * The likeliest a pick can be and still carry a house edge at MIN_ODDS: above this the honest price
 * is under 1.01, so the pick is suspended (priceBook) rather than sold at a loss. Lines like under
 * 5.5 sit just inside it and are priced near the floor, as a real book prices them.
 */
const MAX_PRICEABLE = 0.98;
/**
 * Below this a pick is impossible rather than unlikely: summing the model leaves float residue
 * (around 1e-17 on an outcome the score has ruled out), which must not be sold as a long shot.
 */
const MIN_CHANCE = 1e-9;

/**
 * Decimal odds from a win probability, with the house margin baked in (each outcome priced as if
 * `margin` times likelier, so a book's implied probabilities sum to ~1.08); clamped to the offered band.
 */
export const oddsFrom = (prob: number, margin = 1.08) => Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round((1 / (prob * margin)) * 100) / 100));

// Goals a side scores per 90 minutes in the in-play model (home, away): typical league rates.
const GOAL_RATE = [1.45, 1.15] as const;
const poisson = (mean: number, max = 12): number[] => {
  const p = [Math.exp(-mean)];
  for (let k = 1; k <= max; k++) p.push((p[k - 1]! * mean) / k);
  return p;
};

/** Team-total goal lines and home-handicap lines offered on generated football matches. */
const TEAM_TOTAL_LINES = [0.5, 1.5];
// Half lines only: the grader pushes a level adjusted score, which a half line can't produce.
const FOOTBALL_HANDICAP_LINES = [-1.5, -0.5, 0.5, 1.5];

/** One market's picks by selection code: probabilities (BookProbs), or odds and nulls (Book). */
export interface BookMarket<T> {
  type: MarketType;
  line?: number;
  picks: Record<string, T>;
}
export type BookProbs = BookMarket<number>[];
/** Priced markets. A null pick isn't offerable; a market with no offerable pick is suspended. */
export type Book = BookMarket<number | null>[];

/** One market out of a book, by type and line (markets without a line are found with no line). */
export const bookMarket = <T>(book: BookMarket<T>[], type: MarketType, line?: number | null): BookMarket<T> | undefined =>
  book.find((m) => m.type === type && (m.line ?? null) === (line ?? null));

/**
 * Every football market from ONE scoreline model: the current score plus Poisson goals still to
 * come, `meanH`/`meanA` each. One distribution behind every price keeps the book coherent: priced
 * below it, no set of picks across markets can win in every outcome. `primary` names the goals and
 * handicap lines that carry the main market type; every other offered line comes back as ALT_TOTAL
 * or ALT_HANDICAP, as the feed does it. Draw no bet is the win chance given no draw (a draw refunds
 * the stake). An outcome the score has ruled out gets 0, so priceBook suspends it.
 */
export function footballMarketProbs(
  home: number,
  away: number,
  meanH: number,
  meanA: number,
  primary: { total?: number | null; handicap?: number | null } = {},
): BookProbs {
  const [ph, pa] = [poisson(meanH), poisson(meanA)];
  const cs: Record<string, number> = { OTHER: 0 };
  for (let h = 0; h <= CORRECT_SCORE_MAX; h++) for (let a = 0; a <= CORRECT_SCORE_MAX; a++) cs[`${h}-${a}`] = 0;
  // Mass above each line: whole-match goals, each side's goals, and the home handicap.
  const over = new Map(FOOTBALL_TOTAL_LINES.map((l) => [l, 0]));
  const homeOver = new Map(TEAM_TOTAL_LINES.map((l) => [l, 0]));
  const awayOver = new Map(TEAM_TOTAL_LINES.map((l) => [l, 0]));
  const covers = new Map(FOOTBALL_HANDICAP_LINES.map((l) => [l, 0]));
  let [win, draw, loss, btts, odd, mass] = [0, 0, 0, 0, 0, 0];
  ph.forEach((p1, i) =>
    pa.forEach((p2, j) => {
      const p = p1 * p2;
      const [h, a] = [home + i, away + j];
      mass += p;
      if (h > a) win += p;
      else if (h === a) draw += p;
      else loss += p;
      if (h > 0 && a > 0) btts += p;
      if ((h + a) % 2) odd += p;
      cs[h > CORRECT_SCORE_MAX || a > CORRECT_SCORE_MAX ? "OTHER" : `${h}-${a}`]! += p;
      for (const l of FOOTBALL_TOTAL_LINES) if (h + a > l) over.set(l, over.get(l)! + p);
      for (const l of TEAM_TOTAL_LINES) {
        if (h > l) homeOver.set(l, homeOver.get(l)! + p);
        if (a > l) awayOver.set(l, awayOver.get(l)! + p);
      }
      // "1" wins when home + line - away > 0, exactly as the grader reads the line.
      for (const l of FOOTBALL_HANDICAP_LINES) if (h + l > a) covers.set(l, covers.get(l)! + p);
    }),
  );
  const n = (p: number) => p / mass;
  const ou = (type: MarketType, line: number, above: number): BookMarket<number> => ({ type, line, picks: { OVER: n(above), UNDER: n(mass - above) } });
  return [
    { type: "MATCH_RESULT", picks: { "1": n(win), X: n(draw), "2": n(loss) } },
    { type: "DOUBLE_CHANCE", picks: { "1X": n(win + draw), "12": n(win + loss), X2: n(draw + loss) } },
    ...(win + loss > 0 ? [{ type: "DRAW_NO_BET" as MarketType, picks: { "1": win / (win + loss), "2": loss / (win + loss) } }] : []),
    { type: "BTTS", picks: { BTTS_YES: n(btts), BTTS_NO: n(mass - btts) } },
    { type: "ODD_EVEN", picks: { ODD: n(odd), EVEN: n(mass - odd) } },
    { type: "CORRECT_SCORE", picks: Object.fromEntries(Object.entries(cs).map(([code, p]) => [code, n(p)])) },
    ...FOOTBALL_TOTAL_LINES.map((l) => ou(l === primary.total ? "OVER_UNDER" : "ALT_TOTAL", l, over.get(l)!)),
    ...TEAM_TOTAL_LINES.flatMap((l) => [ou("HOME_TOTAL", l, homeOver.get(l)!), ou("AWAY_TOTAL", l, awayOver.get(l)!)]),
    ...FOOTBALL_HANDICAP_LINES.map((l) => ({
      type: (l === primary.handicap ? "HANDICAP" : "ALT_HANDICAP") as MarketType,
      line: l,
      picks: { "1": n(covers.get(l)!), "2": n(mass - covers.get(l)!) },
    })),
  ];
}

/** Standard normal CDF (Zelen & Severo 26.2.17; error below 7.5e-8). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

// How far a basketball match strays from its expected total and margin, in points.
const BASKETBALL_SD = { total: 18, margin: 12 };
/** Alternate point and handicap lines, as offsets from the main line. */
const BASKETBALL_TOTAL_OFFSETS = [-8, -4, 0, 4, 8];
const BASKETBALL_HANDICAP_OFFSETS = [-7, -3, 0, 3, 7];

/**
 * Generated basketball. Points are nothing like Poisson, so this is a normal approximation: the
 * match total around `totalMean` and the home margin around `marginMean`, independent of each
 * other. One model behind every price, as for football. The total's parity is a coin flip under it,
 * so odd/even is priced at evens, and a tie (which the grader refunds) is too rare to model.
 */
export function basketballMarketProbs(totalMean: number, marginMean: number, primary: { total: number; handicap: number }): BookProbs {
  const above = (line: number) => 1 - normalCdf((line - totalMean) / BASKETBALL_SD.total);
  const covers = (line: number) => normalCdf((marginMean + line) / BASKETBALL_SD.margin);
  return [
    { type: "MONEYLINE", picks: { "1": covers(0), "2": 1 - covers(0) } },
    { type: "ODD_EVEN", picks: { ODD: 0.5, EVEN: 0.5 } },
    ...BASKETBALL_TOTAL_OFFSETS.map((d) => primary.total + d).map((line) => ({
      type: (line === primary.total ? "OVER_UNDER" : "ALT_TOTAL") as MarketType,
      line,
      picks: { OVER: above(line), UNDER: 1 - above(line) },
    })),
    ...BASKETBALL_HANDICAP_OFFSETS.map((d) => primary.handicap + d).map((line) => ({
      type: (line === primary.handicap ? "HANDICAP" : "ALT_HANDICAP") as MarketType,
      line,
      picks: { "1": covers(line), "2": 1 - covers(line) },
    })),
  ];
}

/**
 * Prices with the house margin (oddsFrom). A pick that can no longer win, or is so likely that even
 * the MIN_ODDS floor would pay more than it is worth, is left null: callers suspend it instead of
 * offering it. Every price that does come back returns less than its stake under `probs`.
 */
export function priceBook(probs: BookProbs, margin = 1.08): Book {
  return probs.map(({ type, line, picks }) => ({
    type,
    line,
    picks: Object.fromEntries(Object.entries(picks).map(([code, p]) => [code, p >= MIN_CHANCE && p <= MAX_PRICEABLE ? oddsFrom(p, margin) : null])),
  }));
}

/**
 * In-play prices for a generated football match from what every viewer can see: the score, the
 * minutes of play left and the match's own main lines. It must never be given the match's script:
 * the admin pre-sets the final score, and prices built from it would give the result away.
 * Remaining goals come at league-average rates.
 */
export function inPlayFootballOdds(
  home: number,
  away: number,
  minutesLeft: number,
  primary: { total?: number | null; handicap?: number | null } = {},
  margin = 1.08,
): Book {
  const t = Math.max(0, minutesLeft) / 90;
  return priceBook(footballMarketProbs(home, away, GOAL_RATE[0] * t, GOAL_RATE[1] * t, primary), margin);
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

  // The main line of a market is the one closest to even money, so it reads like a real board.
  const evenest = (lines: number[], chance: (line: number) => number) =>
    lines.reduce((best, l) => (Math.abs(chance(l) - 0.5) < Math.abs(chance(best) - 0.5) ? l : best));

  if (sport === "basketball") {
    // Expected total points and home margin: every price comes from these (basketballMarketProbs).
    const [totalMean, marginMean] = [range(195, 225), range(-9, 9)];
    const halfLine = (x: number) => Math.round(x) + 0.5; // a level adjusted score would push
    const primary = { total: halfLine(totalMean), handicap: halfLine(-marginMean) };
    const priced = priceBook(basketballMarketProbs(totalMean, marginMean, primary));
    const lines = (offsets: number[], main: number) => offsets.map((d) => main + d);
    return {
      sportKey: "basketball",
      competition: pick(BASKETBALL_COMPS),
      ...base,
      result: { home: twoWay(priced, "MONEYLINE")!.home, away: twoWay(priced, "MONEYLINE")!.away },
      total: overUnder(priced, "OVER_UNDER", primary.total)!,
      altTotals: lines(BASKETBALL_TOTAL_OFFSETS, primary.total).map((l) => overUnder(priced, "ALT_TOTAL", l)).filter(offered),
      handicap: twoWay(priced, "HANDICAP", primary.handicap)!,
      altHandicaps: lines(BASKETBALL_HANDICAP_OFFSETS, primary.handicap).map((l) => twoWay(priced, "ALT_HANDICAP", l)).filter(offered),
      oddEven: { odd: priced.find((m) => m.type === "ODD_EVEN")!.picks.ODD!, even: priced.find((m) => m.type === "ODD_EVEN")!.picks.EVEN! },
    };
  }

  // Each side's expected goals (home edge built in): every market is priced from these, so the book
  // is coherent (footballMarketProbs). The ranges keep all five goal lines priceable at kick-off.
  const [meanH, meanA] = [range(1.25, 2.1), range(0.95, 1.6)];
  const atKickOff = (primary: { total?: number; handicap?: number } = {}) => footballMarketProbs(0, 0, meanH, meanA, primary);
  const alt = atKickOff();
  const total = evenest(FOOTBALL_TOTAL_LINES, (l) => bookMarket(alt, "ALT_TOTAL", l)!.picks.OVER!);
  const handicap = evenest(FOOTBALL_HANDICAP_LINES, (l) => bookMarket(alt, "ALT_HANDICAP", l)!.picks["1"]!);
  const priced = priceBook(atKickOff({ total, handicap }));
  // The main lines are the ones nearest even money, so both their sides always price.
  const picks = (type: MarketType) => Object.fromEntries(Object.entries(bookMarket(priced, type)!.picks).filter(([, o]) => o !== null)) as Record<string, number>;
  return {
    sportKey: "football",
    competition: pick(FOOTBALL_COMPS),
    ...base,
    result: { home: picks("MATCH_RESULT")["1"]!, draw: picks("MATCH_RESULT").X!, away: picks("MATCH_RESULT")["2"]! },
    total: overUnder(priced, "OVER_UNDER", total)!,
    altTotals: FOOTBALL_TOTAL_LINES.filter((l) => l !== total).map((l) => overUnder(priced, "ALT_TOTAL", l)).filter(offered),
    homeTotals: TEAM_TOTAL_LINES.map((l) => overUnder(priced, "HOME_TOTAL", l)).filter(offered),
    awayTotals: TEAM_TOTAL_LINES.map((l) => overUnder(priced, "AWAY_TOTAL", l)).filter(offered),
    handicap: twoWay(priced, "HANDICAP", handicap)!,
    altHandicaps: FOOTBALL_HANDICAP_LINES.filter((l) => l !== handicap).map((l) => twoWay(priced, "ALT_HANDICAP", l)).filter(offered),
    btts: { yes: picks("BTTS").BTTS_YES!, no: picks("BTTS").BTTS_NO! },
    doubleChance: { homeDraw: picks("DOUBLE_CHANCE")["1X"]!, homeAway: picks("DOUBLE_CHANCE")["12"]!, drawAway: picks("DOUBLE_CHANCE").X2! },
    drawNoBet: { home: picks("DRAW_NO_BET")["1"]!, away: picks("DRAW_NO_BET")["2"]! },
    oddEven: { odd: picks("ODD_EVEN").ODD!, even: picks("ODD_EVEN").EVEN! },
    correctScore: picks("CORRECT_SCORE"),
  };
}

/** A line is only offered before kick-off when both its sides price; in play they close one by one. */
const offered = <T>(x: T | null): x is T => x !== null;
const overUnder = (book: Book, type: MarketType, line: number) => {
  const p = bookMarket(book, type, line)?.picks;
  return p?.OVER != null && p?.UNDER != null ? { line, over: p.OVER, under: p.UNDER } : null;
};
const twoWay = (book: Book, type: MarketType, line?: number) => {
  const p = bookMarket(book, type, line)?.picks;
  return p?.["1"] != null && p?.["2"] != null ? { line: line as number, home: p["1"], away: p["2"] } : null;
};

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
