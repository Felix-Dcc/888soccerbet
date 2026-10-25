import { describe, expect, it } from "vitest";
import { consensusLine, consistentLadder, EVENT_MARKET_TYPES, medianPrice, parseScore, toEventMarkets, toFixture, toResult } from "../src/lib/providers/odds/theOddsApi";
import { grade } from "../src/lib/settlement";
import { CORRECT_SCORE_MAX, FOOTBALL_TOTAL_LINES } from "../src/lib/markets";
import recorded from "./fixtures/epl-event-extra-markets.json";

// Payload shaped like The Odds API v4 /odds and /events/{id}/odds responses.
const bk = (markets: Array<{ key: string; outcomes: Array<{ name: string; price: number; point?: number }> }>) => ({ markets });
const ev = {
  id: "abc",
  sport_title: "EPL",
  commence_time: "2026-10-25T15:00:00Z",
  home_team: "Arsenal",
  away_team: "Chelsea",
  bookmakers: [
    bk([
      { key: "h2h", outcomes: [{ name: "Arsenal", price: 2.1 }, { name: "Chelsea", price: 3.4 }, { name: "Draw", price: 3.3 }] },
      { key: "totals", outcomes: [{ name: "Over", price: 1.9, point: 2.5 }, { name: "Under", price: 1.95, point: 2.5 }] },
      { key: "spreads", outcomes: [{ name: "Arsenal", price: 1.95, point: -0.5 }, { name: "Chelsea", price: 1.9, point: 0.5 }] },
    ]),
    bk([
      { key: "h2h", outcomes: [{ name: "Arsenal", price: 2.15 }, { name: "Chelsea", price: 3.3 }, { name: "Draw", price: 3.4 }] },
      { key: "totals", outcomes: [{ name: "Over", price: 1.92, point: 2.5 }, { name: "Under", price: 1.9, point: 2.5 }] },
      // quarter line: never offered, must not win the consensus
      { key: "spreads", outcomes: [{ name: "Arsenal", price: 1.8, point: -0.75 }, { name: "Chelsea", price: 2.0, point: 0.75 }] },
    ]),
    bk([
      { key: "totals", outcomes: [{ name: "Over", price: 2.4, point: 3 }, { name: "Under", price: 1.6, point: 3 }] },
      { key: "spreads", outcomes: [{ name: "Arsenal", price: 2.0, point: -0.5 }, { name: "Chelsea", price: 1.85, point: 0.5 }] },
    ]),
  ],
};

describe("The Odds API mapping", () => {
  it("picks the most-quoted whole/half line, ignoring quarter lines", () => {
    expect(consensusLine(ev, "totals", (o) => o.name === "Over")).toBe(2.5);
    expect(consensusLine(ev, "spreads", (o) => o.name === "Arsenal")).toBe(-0.5);
  });

  it("maps 1X2, totals and handicap at the consensus line with median prices", () => {
    const fx = toFixture(ev, "football", "soccer_epl")!;
    expect(fx.providerLeague).toBe("soccer_epl");
    const by = Object.fromEntries(fx.markets.map((m) => [m.type, m]));
    expect(by.MATCH_RESULT!.selections.map((s) => s.milliOdds)).toEqual([2130, 3350, 3350]); // midpoints of 2 books
    expect(by.OVER_UNDER!.line).toBe(2.5);
    expect(by.OVER_UNDER!.selections.map((s) => s.milliOdds)).toEqual([1910, 1920]); // 3.0 line prices excluded
    expect(by.HANDICAP!.line).toBe(-0.5);
    expect(by.HANDICAP!.selections).toEqual([
      { code: "1", name: "Arsenal -0.5", milliOdds: 1980 },
      { code: "2", name: "Chelsea +0.5", milliOdds: 1880 },
    ]);
  });

  it("doesn't let one stale bookmaker set the main price", () => {
    const stale = bk([{ key: "h2h", outcomes: [{ name: "Arsenal", price: 9.5 }, { name: "Chelsea", price: 3.4 }, { name: "Draw", price: 3.3 }] }]);
    const fx = toFixture({ ...ev, bookmakers: [...ev.bookmakers, stale] }, "football", "soccer_epl")!;
    const home = fx.markets.find((m) => m.type === "MATCH_RESULT")!.selections[0]!.milliOdds;
    expect(home).toBe(2150); // median of 2.10, 2.15, 9.50 — not the 9.50 outlier
  });

  it("leaves out a 1X2 whose prices would guarantee a bettor a profit", () => {
    const arb = { ...ev, bookmakers: [bk([{ key: "h2h", outcomes: [{ name: "Arsenal", price: 3.5 }, { name: "Chelsea", price: 3.5 }, { name: "Draw", price: 3.5 }] }])] };
    expect(toFixture(arb, "football", "soccer_epl")!.markets.some((m) => m.type === "MATCH_RESULT")).toBe(false);
  });

  it("maps per-match BTTS, double chance and draw no bet", () => {
    const ms = toEventMarkets({
      ...ev,
      bookmakers: [
        bk([
          { key: "btts", outcomes: [{ name: "Yes", price: 1.7 }, { name: "No", price: 2.1 }] },
          {
            key: "double_chance",
            outcomes: [
              { name: "Arsenal or Draw", price: 1.3 },
              { name: "Arsenal or Chelsea", price: 1.35 },
              { name: "Draw or Chelsea", price: 1.7 },
            ],
          },
          { key: "draw_no_bet", outcomes: [{ name: "Arsenal", price: 1.55 }, { name: "Chelsea", price: 2.45 }] },
        ]),
      ],
    });
    const by = Object.fromEntries(ms.map((m) => [m.type, m.selections.map((s) => [s.code, s.milliOdds])]));
    expect(by.BTTS).toEqual([["BTTS_YES", 1700], ["BTTS_NO", 2100]]);
    expect(by.DOUBLE_CHANCE).toEqual([["1X", 1300], ["12", 1350], ["X2", 1700]]);
    expect(by.DRAW_NO_BET).toEqual([["1", 1550], ["2", 2450]]);
  });

  it("omits a market when either side has no price", () => {
    const ms = toEventMarkets({ ...ev, bookmakers: [bk([{ key: "btts", outcomes: [{ name: "Yes", price: 1.7 }] }])] });
    expect(ms).toEqual([]);
  });

  it("reads in-play and final scores, and ignores games without a score yet", () => {
    const g = { id: "g1", completed: false, home_team: "Arsenal", away_team: "Chelsea" };
    expect(toResult({ ...g, scores: [{ name: "Chelsea", score: "1" }, { name: "Arsenal", score: "2" }] })).toEqual({
      providerRef: "g1", homeScore: 2, awayScore: 1, finished: false,
    });
    expect(toResult({ ...g, completed: true, scores: [{ name: "Arsenal", score: "0" }, { name: "Chelsea", score: "0" }] })?.finished).toBe(true);
    expect(toResult({ ...g, scores: null })).toBeNull();
    expect(toResult({ ...g, scores: [{ name: "Arsenal", score: "" }, { name: "Chelsea", score: "1" }] })).toBeNull();
  });

});

// Real response recorded from The Odds API (event odds, eu region): Aston Villa v Manchester City.
describe("per-match markets from a recorded API response", () => {
  const ev = recorded as Parameters<typeof toEventMarkets>[0];
  const markets = toEventMarkets(ev, ["alternate_totals", "alternate_spreads", "team_totals", "correct_score", "odd_even"]);
  const of = (t: string) => markets.filter((m) => m.type === t);

  it("builds every requested market type the feed priced", () => {
    expect(new Set(markets.map((m) => m.type))).toEqual(new Set(["ALT_TOTAL", "ALT_HANDICAP", "HOME_TOTAL", "AWAY_TOTAL", "CORRECT_SCORE", "ODD_EVEN"]));
    expect(EVENT_MARKET_TYPES).toEqual(expect.arrayContaining(["BTTS", "DOUBLE_CHANCE", "DRAW_NO_BET", "ALT_TOTAL", "CORRECT_SCORE"]));
  });

  it("offers only whole/half lines, every price real (> 1) and no guaranteed-profit pairs", () => {
    for (const m of markets) {
      if (m.line != null) expect(Number.isInteger(m.line * 2)).toBe(true);
      for (const s of m.selections) expect(s.milliOdds).toBeGreaterThan(1000);
      if (m.selections.length === 2) {
        const [a, b] = m.selections.map((s) => s.milliOdds / 1000);
        expect(1 / a! + 1 / b!).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("prices over/under lines at the median, ignoring a bookmaker's 1.00", () => {
    const line25 = of("ALT_TOTAL").find((m) => m.line === 2.5)!;
    const over = medianPrice(ev, "alternate_totals", (o) => o.name === "Over" && o.point === 2.5)!;
    expect(line25.selections.find((s) => s.code === "OVER")!.milliOdds).toBe(Math.round(over * 1000));
    expect(of("ALT_TOTAL").every((m) => m.line! > 0.5 || m.selections.every((s) => s.milliOdds > 1000))).toBe(true);
  });

  it("pairs each home handicap with the away team's mirror line", () => {
    for (const m of of("ALT_HANDICAP")) {
      expect(m.selections[0]!.name.startsWith("Aston Villa")).toBe(true);
      expect(m.selections[1]!.name.startsWith("Manchester City")).toBe(true);
    }
  });

  it("splits team totals by team, and correct scores parse to home-away codes that grade", () => {
    expect(of("HOME_TOTAL").every((m) => m.name === "Aston Villa Over/Under")).toBe(true);
    expect(of("AWAY_TOTAL").every((m) => m.name === "Manchester City Over/Under")).toBe(true);
    const cs = of("CORRECT_SCORE")[0]!;
    expect(cs.selections.length).toBeGreaterThan(10);
    expect(cs.selections.every((s) => /^\d+-\d+$/.test(s.code) || s.code === "OTHER")).toBe(true);
    expect(grade("CORRECT_SCORE", "2-1", null, 2, 1)).toBe("WON");
    expect(parseScore("Aston Villa:2|Manchester City:1", "Aston Villa", "Manchester City")).toEqual([2, 1]);
    expect(parseScore("Chelsea:2|Arsenal:1", "Aston Villa", "Manchester City")).toBeNull();
  });

  it("keeps every ladder consistent: Over dearer and Under cheaper as the line rises; handicap mirrored", () => {
    const byLine = (t: string) => of(t).sort((a, b) => a.line! - b.line!);
    const price = (m: (typeof markets)[number], code: string) => m.selections.find((s) => s.code === code)!.milliOdds;
    for (const t of ["ALT_TOTAL", "HOME_TOTAL", "AWAY_TOTAL"]) {
      const l = byLine(t);
      for (let i = 1; i < l.length; i++) {
        expect(price(l[i]!, "OVER")).toBeGreaterThanOrEqual(price(l[i - 1]!, "OVER"));
        expect(price(l[i]!, "UNDER")).toBeLessThanOrEqual(price(l[i - 1]!, "UNDER"));
      }
    }
    const h = byLine("ALT_HANDICAP");
    for (let i = 1; i < h.length; i++) {
      expect(price(h[i]!, "1")).toBeLessThanOrEqual(price(h[i - 1]!, "1"));
      expect(price(h[i]!, "2")).toBeGreaterThanOrEqual(price(h[i - 1]!, "2"));
    }
  });
});

describe("correct score grid and over/under lines, from the recorded response", () => {
  const ev = recorded as Parameters<typeof toEventMarkets>[0];
  const markets = toEventMarkets(ev, ["alternate_totals", "correct_score"]);
  const cs = markets.find((m) => m.type === "CORRECT_SCORE")!;
  const goals = (code: string) => code.split("-").map(Number);

  it("offers over/under only at 1.5, 2.5, 3.5, 4.5 and 5.5", () => {
    const lines = markets.filter((m) => m.type === "ALT_TOTAL").map((m) => m.line);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => FOOTBALL_TOTAL_LINES.includes(l!))).toBe(true);
  });

  it("lists each score 0-0 to 4-4 once, everything bigger as one 'Other'", () => {
    const codes = cs.selections.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length); // one pick per score, whichever team a book lists first
    const grid = codes.filter((c) => c !== "OTHER");
    expect(grid.every((c) => goals(c).every((g) => g <= CORRECT_SCORE_MAX))).toBe(true);
    expect(codes.filter((c) => c === "OTHER")).toHaveLength(1);
  });

  it("prices 'Other' as backing every quoted bigger score together: 1 / sum(1/price)", () => {
    // Recompute from the raw feed: median per score (names in either team order), then combine.
    const prices = new Map<string, number[]>();
    for (const b of ev.bookmakers ?? [])
      for (const m of b.markets ?? [])
        if (m.key === "correct_score")
          for (const o of m.outcomes ?? []) {
            const s = parseScore(o.name, ev.home_team, ev.away_team)!;
            if (Math.max(...s) > CORRECT_SCORE_MAX && o.price > 1) prices.set(s.join("-"), [...(prices.get(s.join("-")) ?? []), o.price]);
          }
    const median = (xs: number[]) => {
      const v = [...xs].sort((a, b) => a - b);
      const mid = v.length >> 1;
      return v.length % 2 ? v[mid]! : Math.round(((v[mid - 1]! + v[mid]!) / 2) * 100) / 100;
    };
    const expected = 1 / [...prices.values()].reduce((sum, ps) => sum + 1 / median(ps), 0);
    expect(cs.selections.find((s) => s.code === "OTHER")!.milliOdds).toBe(Math.round(expected * 1000));
  });
});

describe("consistentLadder", () => {
  it("drops the line fewer bookmakers back when two lines contradict", () => {
    const kept = consistentLadder(
      [
        { line: 4.5, a: 5.1, b: 1.16, books: 6 },
        { line: 5, a: 10.5, b: 1.07, books: 1 }, // Over 5 dearer than Over 5.5: the outlier
        { line: 5.5, a: 9.3, b: 1.05, books: 4 },
      ],
      true,
    );
    expect(kept.map((r) => r.line)).toEqual([4.5, 5.5]);
  });
});
