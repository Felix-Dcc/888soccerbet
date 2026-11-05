/**
 * The Odds API adapter — real pre-match odds only. IMPORTANT: this is an odds feed,
 * NOT a licensed sportsbook. It provides no bet placement, settlement, risk management
 * or liability. 888SoccerBet's own engine handles those against whatever feed is configured.
 *
 * Every price is the median of the real bookmaker prices for that exact outcome and line (a
 * single stale or outlier bookmaker can't set ours), and a market is left out when its prices
 * would let a bettor back every outcome at a guaranteed profit. Nothing is derived or invented. Lines are each match's consensus (most-quoted) line, limited to whole
 * and half lines: quarter lines (e.g. 2.75) split a stake into half-win/half-refund, which the
 * settlement engine doesn't model, so they're never offered.
 *
 * Credit cost (measured): bulk odds = 1 per market per region per league; per-match markets
 * (fetchEventMarkets) = 1 per market per region per match; scores = 1 per league (live/upcoming),
 * 2 per league with daysFrom (adds completed games).
 */
import type { MarketType } from "@prisma/client";
import { toMilliOdds } from "../../money";
import { CORRECT_SCORE_MAX, FOOTBALL_TOTAL_LINES } from "../../markets";
import type { EventRef, OddsProvider, ProviderFixture, ProviderMarket, ProviderResult } from "./types";

const API = "https://api.the-odds-api.com/v4";
const SOCCER_KEYS = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_uefa_champs_league",
];
const SPORT_KEYS: Record<string, string[]> = {
  football: SOCCER_KEYS,
  basketball: ["basketball_nba"],
};

interface Outcome {
  name: string;
  description?: string; // team name on team-total outcomes
  price: number;
  point?: number;
}
interface ApiEvent {
  id: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{ markets?: Array<{ key: string; outcomes?: Outcome[] }> }>;
}

const halfLine = (p: number | undefined): p is number => p !== undefined && Number.isInteger(p * 2);
const signed = (p: number) => (p > 0 ? `+${p}` : `${p}`);


/** The line most bookmakers quote for `marketKey` (whole/half lines only); ties -> smaller |line|. */
export function consensusLine(ev: ApiEvent, marketKey: string, pick: (o: Outcome) => boolean): number | null {
  const counts = new Map<number, number>();
  for (const bk of ev.bookmakers ?? []) {
    const seen = new Set<number>(); // count each bookmaker once per line
    for (const mk of bk.markets ?? [])
      if (mk.key === marketKey) for (const o of mk.outcomes ?? []) if (pick(o) && halfLine(o.point)) seen.add(o.point);
    for (const p of seen) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [p, n] of counts) {
    const bn = best === null ? -1 : counts.get(best)!;
    if (n > bn || (n === bn && Math.abs(p) < Math.abs(best!))) best = p;
  }
  return best;
}

export function toFixture(ev: ApiEvent, sportKey: string, league: string): ProviderFixture | null {
  const home = medianPrice(ev, "h2h", (o) => o.name === ev.home_team);
  const away = medianPrice(ev, "h2h", (o) => o.name === ev.away_team);
  if (home === null || away === null) return null;
  const draw = medianPrice(ev, "h2h", (o) => o.name !== ev.home_team && o.name !== ev.away_team);
  const markets: ProviderMarket[] = [];
  if (sportKey === "football" && draw !== null) {
    // Same guard as the two-way markets: no set of prices a bettor could back all of at a profit.
    if (1 / home + 1 / draw + 1 / away >= 1) {
      markets.push({
        type: "MATCH_RESULT",
        name: "Match Result",
        selections: [
          { code: "1", name: "Home", milliOdds: toMilliOdds(home) },
          { code: "X", name: "Draw", milliOdds: toMilliOdds(draw) },
          { code: "2", name: "Away", milliOdds: toMilliOdds(away) },
        ],
      });
    }
  } else if (fair(home, away)) {
    markets.push({
      type: "MONEYLINE",
      name: "Match Winner",
      selections: [
        { code: "1", name: "Home", milliOdds: toMilliOdds(home) },
        { code: "2", name: "Away", milliOdds: toMilliOdds(away) },
      ],
    });
  }

  // Football: main goal line from the offered set only (1.5–5.5); basketball keeps its points line.
  const total = consensusLine(ev, "totals", (o) => /^over$/i.test(o.name) && (sportKey !== "football" || FOOTBALL_TOTAL_LINES.includes(o.point!)));
  if (total !== null) {
    const over = medianPrice(ev, "totals", (o) => /^over$/i.test(o.name) && o.point === total);
    const under = medianPrice(ev, "totals", (o) => /^under$/i.test(o.name) && o.point === total);
    if (over !== null && under !== null && fair(over, under))
      markets.push({
        type: "OVER_UNDER",
        name: sportKey === "basketball" ? "Total Points" : "Total Goals",
        line: total,
        selections: [
          { code: "OVER", name: `Over ${total}`, milliOdds: toMilliOdds(over) },
          { code: "UNDER", name: `Under ${total}`, milliOdds: toMilliOdds(under) },
        ],
      });
  }

  // Handicap / point spread: line is the home team's handicap; away takes the mirror line.
  const hcp = consensusLine(ev, "spreads", (o) => o.name === ev.home_team);
  if (hcp !== null) {
    const h = medianPrice(ev, "spreads", (o) => o.name === ev.home_team && o.point === hcp);
    const a = medianPrice(ev, "spreads", (o) => o.name === ev.away_team && o.point === -hcp);
    if (h !== null && a !== null && fair(h, a))
      markets.push({
        type: "HANDICAP",
        name: sportKey === "basketball" ? "Point Spread" : "Handicap",
        line: hcp,
        selections: [
          { code: "1", name: `${ev.home_team} ${signed(hcp)}`, milliOdds: toMilliOdds(h) },
          { code: "2", name: `${ev.away_team} ${signed(-hcp)}`, milliOdds: toMilliOdds(a) },
        ],
      });
  }

  return {
    providerRef: ev.id,
    sportKey,
    competition: ev.sport_title ?? sportKey,
    providerLeague: league,
    homeTeam: ev.home_team,
    awayTeam: ev.away_team,
    startsAt: ev.commence_time,
    markets,
  };
}

/**
 * Per-match markets, as a registry: API market key -> the 888SoccerBet market types it produces and
 * how to build them from the bookmakers' prices. To offer another market the feed prices, add an
 * entry here (and a grading rule in settlement.ts); which keys are requested is configuration
 * (ODDS_EXTRA_MARKETS). Only markets that settle from the final score are listed — the results
 * feed has no half-time scores, corners, cards or player stats.
 *
 * Prices here are the MEDIAN across bookmakers quoting that exact outcome (not the best price):
 * extra lines are often quoted by one or two books, and a single stale price must not set ours.
 * Two-way lines are dropped when the pair would guarantee a profit (1/a + 1/b < 1).
 */
/** Every bookmaker price (> 1.00) for outcomes matching `pick`. */
function quotes(ev: ApiEvent, marketKey: string, pick: (o: Outcome) => boolean): number[] {
  const prices: number[] = [];
  for (const bk of ev.bookmakers ?? [])
    for (const mk of bk.markets ?? [])
      if (mk.key === marketKey) for (const o of mk.outcomes ?? []) if (pick(o) && o.price > 1) prices.push(o.price);
  return prices;
}

export function medianPrice(ev: ApiEvent, marketKey: string, pick: (o: Outcome) => boolean): number | null {
  const prices = quotes(ev, marketKey, pick);
  if (!prices.length) return null;
  prices.sort((a, b) => a - b);
  const mid = prices.length >> 1;
  return prices.length % 2 ? prices[mid]! : Math.round(((prices[mid - 1]! + prices[mid]!) / 2) * 100) / 100;
}

/** A two-way price pair a bettor can't back both sides of for a guaranteed profit. */
const fair = (a: number, b: number) => 1 / a + 1 / b >= 1;

/** Every whole/half line quoted for outcomes matching `pick`, ascending. */
function linesOf(ev: ApiEvent, marketKey: string, pick: (o: Outcome) => boolean): number[] {
  const set = new Set<number>();
  for (const bk of ev.bookmakers ?? [])
    for (const mk of bk.markets ?? []) if (mk.key === marketKey) for (const o of mk.outcomes ?? []) if (pick(o) && halfLine(o.point)) set.add(o.point);
  return [...set].sort((a, b) => a - b);
}

type Rung = { line: number; a: number; b: number; books: number };

/**
 * Keep only lines whose prices form a consistent ladder: as the line rises, side `a` must not get
 * cheaper (aRises) or dearer (!aRises), and side `b` the opposite. Lines are medians over
 * different sets of bookmakers, so neighbours can contradict (e.g. Over 5 dearer than Over 5.5),
 * which would hand bettors a free edge. When lines conflict, the one more bookmakers quote wins.
 */
export function consistentLadder(rungs: Rung[], aRises: boolean): Rung[] {
  const ok = (x: Rung, y: Rung) => {
    const [lo, hi] = x.line < y.line ? [x, y] : [y, x];
    return aRises ? hi.a >= lo.a && hi.b <= lo.b : hi.a <= lo.a && hi.b >= lo.b;
  };
  const kept: Rung[] = [];
  for (const r of [...rungs].sort((x, y) => y.books - x.books || Math.abs(x.line) - Math.abs(y.line)))
    if (kept.every((k) => ok(k, r))) kept.push(r);
  return kept.sort((x, y) => x.line - y.line);
}

/** Over/under pairs at every line, for a whole-match total or one team's total. */
function overUnderLines(ev: ApiEvent, marketKey: string, type: MarketType, name: string, team?: string): ProviderMarket[] {
  const forTeam = (o: Outcome) => team === undefined || o.description === team;
  const rungs: Rung[] = [];
  for (const line of linesOf(ev, marketKey, forTeam)) {
    const isOver = (o: Outcome) => forTeam(o) && /^over$/i.test(o.name) && o.point === line;
    const isUnder = (o: Outcome) => forTeam(o) && /^under$/i.test(o.name) && o.point === line;
    const over = medianPrice(ev, marketKey, isOver);
    const under = medianPrice(ev, marketKey, isUnder);
    if (over === null || under === null || !fair(over, under)) continue;
    rungs.push({ line, a: over, b: under, books: Math.min(quotes(ev, marketKey, isOver).length, quotes(ev, marketKey, isUnder).length) });
  }
  // Over pays more as the line rises; Under pays less.
  return consistentLadder(rungs, true).map(({ line, a: over, b: under }) => ({
    type,
    name,
    line,
    selections: [
      { code: "OVER", name: `${team ? `${team} ` : ""}Over ${line}`, milliOdds: toMilliOdds(over) },
      { code: "UNDER", name: `${team ? `${team} ` : ""}Under ${line}`, milliOdds: toMilliOdds(under) },
    ],
  }));
}

type Builder = (ev: ApiEvent) => ProviderMarket[];
export const EVENT_MARKETS: Record<string, { types: MarketType[]; build: Builder }> = {
  btts: {
    types: ["BTTS"],
    build: (ev) => {
      const yes = medianPrice(ev, "btts", (o) => /^yes$/i.test(o.name));
      const no = medianPrice(ev, "btts", (o) => /^no$/i.test(o.name));
      if (yes === null || no === null || !fair(yes, no)) return [];
      return [
        {
          type: "BTTS",
          name: "Both Teams To Score",
          selections: [
            { code: "BTTS_YES", name: "Yes", milliOdds: toMilliOdds(yes) },
            { code: "BTTS_NO", name: "No", milliOdds: toMilliOdds(no) },
          ],
        },
      ];
    },
  },
  double_chance: {
    types: ["DOUBLE_CHANCE"],
    build: (ev) => {
      const H = ev.home_team;
      const A = ev.away_team;
      // Outcomes are named "<Team> or Draw" / "<Home> or <Away>"; match by the parts.
      const dc = (want: string[]) =>
        medianPrice(ev, "double_chance", (o) => {
          const parts = o.name.split(" or ").map((s) => s.trim());
          return parts.length === 2 && want.every((w) => parts.includes(w));
        });
      const hx = dc([H, "Draw"]);
      const xa = dc([A, "Draw"]);
      const ha = dc([H, A]);
      if (hx === null || xa === null || ha === null) return [];
      return [
        {
          type: "DOUBLE_CHANCE",
          name: "Double Chance",
          selections: [
            { code: "1X", name: `${H} or Draw`, milliOdds: toMilliOdds(hx) },
            { code: "12", name: `${H} or ${A}`, milliOdds: toMilliOdds(ha) },
            { code: "X2", name: `${A} or Draw`, milliOdds: toMilliOdds(xa) },
          ],
        },
      ];
    },
  },
  draw_no_bet: {
    types: ["DRAW_NO_BET"],
    build: (ev) => {
      const dh = medianPrice(ev, "draw_no_bet", (o) => o.name === ev.home_team);
      const da = medianPrice(ev, "draw_no_bet", (o) => o.name === ev.away_team);
      if (dh === null || da === null || !fair(dh, da)) return [];
      return [
        {
          type: "DRAW_NO_BET",
          name: "Draw No Bet",
          selections: [
            { code: "1", name: ev.home_team, milliOdds: toMilliOdds(dh) },
            { code: "2", name: ev.away_team, milliOdds: toMilliOdds(da) },
          ],
        },
      ];
    },
  },
  alternate_totals: {
    types: ["ALT_TOTAL"],
    // Laddered over every quoted line first (more data for the consistency check), then trimmed to the offered set.
    build: (ev) => overUnderLines(ev, "alternate_totals", "ALT_TOTAL", "Over/Under").filter((m) => FOOTBALL_TOTAL_LINES.includes(m.line!)),
  },
  team_totals: {
    types: ["HOME_TOTAL", "AWAY_TOTAL"],
    build: (ev) => [
      ...overUnderLines(ev, "team_totals", "HOME_TOTAL", `${ev.home_team} Over/Under`, ev.home_team),
      ...overUnderLines(ev, "team_totals", "AWAY_TOTAL", `${ev.away_team} Over/Under`, ev.away_team),
    ],
  },
  alternate_spreads: {
    types: ["ALT_HANDICAP"],
    build: (ev) => {
      const H = ev.home_team;
      const A = ev.away_team;
      const rungs: Rung[] = [];
      for (const line of linesOf(ev, "alternate_spreads", (o) => o.name === H)) {
        const isH = (o: Outcome) => o.name === H && o.point === line;
        const isA = (o: Outcome) => o.name === A && o.point === -line;
        const h = medianPrice(ev, "alternate_spreads", isH);
        const a = medianPrice(ev, "alternate_spreads", isA);
        if (h === null || a === null || !fair(h, a)) continue;
        rungs.push({ line, a: h, b: a, books: Math.min(quotes(ev, "alternate_spreads", isH).length, quotes(ev, "alternate_spreads", isA).length) });
      }
      // A bigger home head start (higher line) makes the home side shorter and the away side longer.
      return consistentLadder(rungs, false).map(({ line, a: h, b: a }) => ({
        type: "ALT_HANDICAP" as const,
        name: "Handicap",
        line,
        selections: [
          { code: "1", name: `${H} ${signed(line)}`, milliOdds: toMilliOdds(h) },
          { code: "2", name: `${A} ${signed(-line)}`, milliOdds: toMilliOdds(a) },
        ],
      }));
    },
  },
  correct_score: {
    types: ["CORRECT_SCORE"],
    build: (ev) => {
      // Outcomes are named "<Home>:<goals>|<Away>:<goals>".
      const scores = new Map<string, [number, number]>();
      for (const bk of ev.bookmakers ?? [])
        for (const mk of bk.markets ?? [])
          if (mk.key === "correct_score")
            for (const o of mk.outcomes ?? []) {
              const s = parseScore(o.name, ev.home_team, ev.away_team);
              if (s) scores.set(o.name, s);
            }
      // Several names can mean one score (books list home or away first): one median per score.
      const priced = new Map<string, { h: number; a: number; price: number }>();
      for (const [h, a] of scores.values()) {
        const key = `${h}-${a}`;
        if (priced.has(key)) continue;
        const price = medianPrice(ev, "correct_score", (o) => {
          const s = parseScore(o.name, ev.home_team, ev.away_team);
          return !!s && s[0] === h && s[1] === a;
        });
        if (price !== null) priced.set(key, { h, a, price });
      }
      const all = [...priced.values()];
      const grid = all.filter((s) => s.h <= CORRECT_SCORE_MAX && s.a <= CORRECT_SCORE_MAX).sort((x, y) => x.h - y.h || x.a - y.a);
      const selections = grid.map((s) => ({ code: `${s.h}-${s.a}`, name: `${s.h}-${s.a}`, milliOdds: toMilliOdds(s.price) }));
      // "Other" = every quoted score with a side above the grid, backed together: 1 / sum(1/price).
      // Built only from those real prices; no quotes above the grid means no "Other" to offer.
      const rest = all.filter((s) => s.h > CORRECT_SCORE_MAX || s.a > CORRECT_SCORE_MAX);
      if (rest.length) {
        const other = 1 / rest.reduce((sum, s) => sum + 1 / s.price, 0);
        if (other > 1) selections.push({ code: "OTHER", name: "Other", milliOdds: toMilliOdds(other) });
      }
      return selections.length ? [{ type: "CORRECT_SCORE", name: "Correct Score", selections }] : [];
    },
  },
  odd_even: {
    types: ["ODD_EVEN"],
    build: (ev) => {
      const odd = medianPrice(ev, "odd_even", (o) => /^odd$/i.test(o.name));
      const even = medianPrice(ev, "odd_even", (o) => /^even$/i.test(o.name));
      if (odd === null || even === null || !fair(odd, even)) return [];
      return [
        {
          type: "ODD_EVEN",
          name: "Odd/Even",
          selections: [
            { code: "ODD", name: "Odd", milliOdds: toMilliOdds(odd) },
            { code: "EVEN", name: "Even", milliOdds: toMilliOdds(even) },
          ],
        },
      ];
    },
  },
};

/** "Aston Villa:2|Manchester City:1" -> [2, 1] in home/away order; null if it doesn't name both teams. */
export function parseScore(name: string, home: string, away: string): [number, number] | null {
  const parts = Object.fromEntries(
    name.split("|").map((p) => {
      const i = p.lastIndexOf(":");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const h = parts[home];
  const a = parts[away];
  if (h === undefined || a === undefined || !/^\d+$/.test(h) || !/^\d+$/.test(a)) return null;
  return [Number(h), Number(a)];
}

/** Every 888SoccerBet market type the per-match sync is responsible for (suspended when not refreshed). */
export const EVENT_MARKET_TYPES: MarketType[] = [...new Set(Object.values(EVENT_MARKETS).flatMap((m) => m.types))];

/** Build all per-match markets for the requested API keys (unknown keys are ignored). */
export function toEventMarkets(ev: ApiEvent, keys: string[] = Object.keys(EVENT_MARKETS)): ProviderMarket[] {
  return keys.flatMap((k) => EVENT_MARKETS[k]?.build(ev) ?? []);
}

interface ApiScore {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: Array<{ name: string; score: string }> | null;
}

/** A scores-feed game -> result; null until the feed has a numeric score for both teams. */
export function toResult(g: ApiScore): ProviderResult | null {
  const h = g.scores?.find((s) => s.name === g.home_team)?.score;
  const a = g.scores?.find((s) => s.name === g.away_team)?.score;
  if (!h || !a || !/^\d+$/.test(h) || !/^\d+$/.test(a)) return null; // "" or missing = no score yet
  return { providerRef: g.id, homeScore: Number(h), awayScore: Number(a), finished: g.completed };
}

export class TheOddsApiProvider implements OddsProvider {
  readonly name = "theoddsapi";
  readonly isSandbox = false;
  readonly bulkMarketTypes: readonly MarketType[] = ["MATCH_RESULT", "MONEYLINE", "OVER_UNDER", "HANDICAP"];
  // All registry types, requested or not: a market dropped from the config is suspended, never left stale.
  readonly eventMarketTypes: readonly MarketType[] = EVENT_MARKET_TYPES;

  creditsRemaining: number | null = null;

  constructor(
    private key: string,
    private region = process.env.ODDS_REGION ?? "eu",
    private markets = process.env.ODDS_MARKETS ?? "h2h,spreads,totals",
    private eventMarkets = process.env.ODDS_EXTRA_MARKETS ?? Object.keys(EVENT_MARKETS).join(","),
  ) {}

  /** GET that records the remaining-credits header, so callers can stay within budget. */
  private async get(url: string): Promise<Response> {
    const r = await fetch(url);
    const left = Number(r.headers.get("x-requests-remaining"));
    if (r.headers.has("x-requests-remaining") && Number.isFinite(left)) this.creditsRemaining = left;
    return r;
  }

  async fetchFixtures(sports: string[], { leagues, mainOnly }: { leagues?: string[]; mainOnly?: boolean } = {}): Promise<ProviderFixture[]> {
    const out: ProviderFixture[] = [];
    const markets = mainOnly ? "h2h" : this.markets; // 1 credit per league instead of 3
    for (const sport of sports) {
      for (const leagueKey of (SPORT_KEYS[sport] ?? []).filter((k) => !leagues || leagues.includes(k))) {
        const url = `${API}/sports/${leagueKey}/odds?apiKey=${this.key}&regions=${this.region}&markets=${markets}&oddsFormat=decimal&dateFormat=iso`;
        const r = await this.get(url);
        if (!r.ok) continue; // league inactive / out of credits — skip, keep others
        const events = (await r.json()) as ApiEvent[];
        for (const ev of events) {
          const fx = toFixture(ev, sport, leagueKey);
          if (fx) out.push(fx);
        }
      }
    }
    return out;
  }

  async fetchEventMarkets(events: EventRef[]): Promise<Map<string, ProviderMarket[]>> {
    const out = new Map<string, ProviderMarket[]>();
    for (const e of events) {
      const url = `${API}/sports/${e.league}/events/${e.providerRef}/odds?apiKey=${this.key}&regions=${this.region}&markets=${this.eventMarkets}&oddsFormat=decimal&dateFormat=iso`;
      const r = await this.get(url);
      if (!r.ok) continue; // event gone / out of credits: its extra markets get suspended by the caller
      out.set(e.providerRef, toEventMarkets((await r.json()) as ApiEvent, this.eventMarkets.split(",").map((k) => k.trim())));
    }
    return out;
  }

  async fetchResults(providerRefs: string[], leagues?: string[]): Promise<ProviderResult[]> {
    const want = new Set(providerRefs);
    return (await this.scores(leagues ?? [...SOCCER_KEYS, "basketball_nba"], "&daysFrom=3")).filter((r) => want.has(r.providerRef));
  }

  async fetchLiveScores(leagues: string[]): Promise<ProviderResult[]> {
    return this.scores(leagues, ""); // no daysFrom: in-play + upcoming only, 1 credit per league
  }

  private async scores(leagues: string[], extra: string): Promise<ProviderResult[]> {
    const out: ProviderResult[] = [];
    for (const leagueKey of leagues) {
      const r = await this.get(`${API}/sports/${leagueKey}/scores?apiKey=${this.key}&dateFormat=iso${extra}`);
      if (!r.ok) continue;
      const games = (await r.json()) as ApiScore[];
      for (const g of games) {
        const res = toResult(g);
        if (res) out.push(res);
      }
    }
    return out;
  }
}
