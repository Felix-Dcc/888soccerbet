import { describe, it, expect } from "vitest";
import { basketballMarketProbs, bookMarket, footballMarketProbs, generateMatch, inPlayFootballOdds, priceBook, type BookProbs } from "../src/lib/matchGenerator";
import { FOOTBALL_TOTAL_LINES } from "../src/lib/markets";
import { manualFixtureSchema } from "../src/lib/validation";

/** Implied probabilities of the picks on offer: above 1 means the house holds a margin. */
const impliedSum = (odds: (number | null | undefined)[]) => odds.reduce<number>((sum, o) => (o == null ? sum : sum + 1 / o), 0);
const lines = (m: { line: number }[] | undefined) => (m ?? []).map((l) => l.line).sort((a, b) => a - b);

describe("generateMatch", () => {
  it("builds a schema-valid fictional football match with every market", () => {
    for (let i = 0; i < 60; i++) {
      const m = generateMatch("football");
      expect(manualFixtureSchema.safeParse(m).success).toBe(true);
      expect(m.homeTeam).not.toBe(m.awayTeam);
      expect(m.sportKey).toBe("football");
      expect(m.result.draw).toBeDefined();
      expect(m.total).toBeDefined();
      expect(m.btts).toBeDefined();
      const odds = [m.result.home, m.result.draw!, m.result.away, m.total!.over, m.total!.under, m.btts!.yes, m.btts!.no];
      for (const o of odds) expect(o).toBeGreaterThanOrEqual(1.01), expect(o).toBeLessThanOrEqual(26);
      expect(new Date(m.startsAt).getTime()).toBeGreaterThan(Date.now() + 60_000);
    }
  });

  it("builds a schema-valid basketball match with no draw and no BTTS", () => {
    for (let i = 0; i < 40; i++) {
      const m = generateMatch("basketball");
      expect(manualFixtureSchema.safeParse(m).success).toBe(true);
      expect(m.result.draw).toBeUndefined();
      expect(m.btts).toBeUndefined();
      expect(Number.isInteger(m.total!.line * 2)).toBe(true); // half or whole line
    }
  });
});

describe("house margin", () => {
  it("prices generated matches with the margin on the house's side (implied probabilities sum above 1)", () => {
    for (let i = 0; i < 60; i++) {
      const m = generateMatch("football");
      expect(impliedSum([m.result.home, m.result.draw!, m.result.away])).toBeGreaterThan(1);
      expect(impliedSum([m.total!.over, m.total!.under])).toBeGreaterThan(1);
    }
  });

  it("keeps the margin on every extra line and market, football and basketball", () => {
    for (const sport of ["football", "basketball"] as const)
      for (let i = 0; i < 40; i++) {
        const m = generateMatch(sport);
        const twoWay = [m.total!, ...(m.altTotals ?? []), ...(m.homeTotals ?? []), ...(m.awayTotals ?? [])].map((t) => [t.over, t.under]);
        const hcp = [m.handicap!, ...(m.altHandicaps ?? [])].map((h) => [h.home, h.away]);
        for (const pair of [...twoWay, ...hcp]) expect(impliedSum(pair)).toBeGreaterThan(1);
        expect(impliedSum(Object.values(m.oddEven!))).toBeGreaterThan(1);
        if (sport === "football") {
          for (const market of [m.btts!, m.doubleChance!, m.drawNoBet!]) expect(impliedSum(Object.values(market))).toBeGreaterThan(1);
          expect(impliedSum(Object.values(m.correctScore!))).toBeGreaterThan(1);
        }
      }
  });
});

describe("generated football markets", () => {
  it("offers all five goal lines, team totals, four handicaps and all 26 correct scores", () => {
    for (let i = 0; i < 60; i++) {
      const m = generateMatch("football");
      expect(lines([m.total!, ...(m.altTotals ?? [])])).toEqual(FOOTBALL_TOTAL_LINES);
      expect(lines(m.homeTotals)).toEqual([0.5, 1.5]);
      expect(lines(m.awayTotals)).toEqual([0.5, 1.5]);
      expect(lines([m.handicap!, ...(m.altHandicaps ?? [])])).toEqual([-1.5, -0.5, 0.5, 1.5]);
      expect(Object.keys(m.correctScore!)).toHaveLength(26);
      expect(m.correctScore).toHaveProperty("4-4");
      expect(m.correctScore).toHaveProperty("OTHER");
    }
  });

  it("gives basketball alternate point lines and a spread, but no correct score or both teams to score", () => {
    const m = generateMatch("basketball");
    expect(m.altTotals).toHaveLength(4);
    expect(lines([m.total!, ...m.altTotals!])).toEqual(lines([m.total!]).flatMap((l) => [l - 8, l - 4, l, l + 4, l + 8]).sort((a, b) => a - b));
    expect(m.altHandicaps).toHaveLength(4);
    for (const h of [m.handicap!, ...m.altHandicaps!]) expect(Number.isInteger(h.line * 2) && !Number.isInteger(h.line)).toBe(true);
    expect(m.oddEven).toBeDefined();
    expect(m.correctScore ?? m.doubleChance ?? m.drawNoBet ?? m.btts).toBeUndefined();
  });

  /**
   * No arbitrage across markets and lines: every price comes from one distribution over final
   * scores, so if each pick returns less than its stake under that distribution, no set of picks
   * can pay out more than it costs in every outcome.
   */
  it("never lets a set of picks across markets win in every outcome", () => {
    const cases: BookProbs[] = [];
    for (let i = 0; i < 20; i++) {
      const [mh, ma] = [1.25 + Math.random() * 0.85, 0.95 + Math.random() * 0.65];
      cases.push(footballMarketProbs(0, 0, mh, ma, { total: 2.5, handicap: -0.5 })); // pre-match
      cases.push(basketballMarketProbs(195 + Math.random() * 30, Math.random() * 18 - 9, { total: 210.5, handicap: -4.5 }));
    }
    for (const [h, a] of [[0, 0], [1, 0], [0, 2], [2, 2], [3, 1], [4, 4]] as const)
      for (const left of [80, 45, 20, 5, 0]) cases.push(footballMarketProbs(h, a, (1.45 * left) / 90, (1.15 * left) / 90, { total: 2.5, handicap: -0.5 }));

    for (const probs of cases) {
      const priced = priceBook(probs);
      const draw = bookMarket(probs, "MATCH_RESULT")?.picks.X ?? 0;
      for (const market of priced) {
        const model = bookMarket(probs, market.type, market.line)!;
        for (const [code, odds] of Object.entries(market.picks)) {
          if (odds === null) continue;
          const p = model.picks[code]!;
          // Draw no bet refunds on a draw: return = P(no draw) x P(win | no draw) x odds + P(draw).
          const ret = market.type === "DRAW_NO_BET" ? (1 - draw) * p * odds + draw : p * odds;
          expect(ret, `${market.type} ${market.line ?? ""} ${code}`).toBeLessThan(1);
        }
        // A line can end up one-sided in play (under 4.5 is unsellable at 0-2 with minutes left);
        // the margin is a whole-market property, so check it where every pick is still on offer.
        if (Object.values(market.picks).every((o) => o !== null))
          expect(impliedSum(Object.values(market.picks)), `${market.type} ${market.line ?? ""}`).toBeGreaterThan(1);
      }
    }
  });
});

describe("inPlayFootballOdds", () => {
  const at = (h: number, a: number, left: number) => inPlayFootballOdds(h, a, left, { total: 2.5, handicap: -0.5 });

  it("depends only on the score, the minutes left and the lines: same inputs, same prices", () => {
    expect(at(1, 1, 37)).toEqual(at(1, 1, 37));
  });

  it("moves with the score and the clock", () => {
    const start = at(0, 0, 90);
    expect(bookMarket(at(0, 0, 20), "MATCH_RESULT")!.picks.X!).toBeLessThan(bookMarket(start, "MATCH_RESULT")!.picks.X!); // goalless late on
    expect(bookMarket(at(1, 0, 60), "MATCH_RESULT")!.picks["1"]!).toBeLessThan(bookMarket(start, "MATCH_RESULT")!.picks["1"]!); // a goal up
  });

  it("closes picks the score has ruled out, on every market and line", () => {
    const oneNil = at(1, 0, 70);
    expect(bookMarket(oneNil, "CORRECT_SCORE")!.picks["0-0"]).toBeNull();
    expect(bookMarket(oneNil, "CORRECT_SCORE")!.picks["0-1"]).toBeNull();
    expect(bookMarket(oneNil, "CORRECT_SCORE")!.picks["1-0"]).not.toBeNull();
    expect(bookMarket(oneNil, "HOME_TOTAL", 0.5)!.picks.UNDER).toBeNull(); // home has scored
    expect(bookMarket(oneNil, "AWAY_TOTAL", 0.5)!.picks.UNDER).not.toBeNull();

    const twoGoals = at(2, 0, 40);
    expect(bookMarket(twoGoals, "ALT_TOTAL", 1.5)!.picks.UNDER).toBeNull(); // over 1.5 is already in
    expect(bookMarket(twoGoals, "ALT_TOTAL", 1.5)!.picks.OVER).toBeNull(); // and over can't be sold at a loss
    expect(bookMarket(twoGoals, "OVER_UNDER", 2.5)!.picks.OVER).not.toBeNull();

    // A goal margin can always flip while goals remain, so on a handicap it is the price that closes,
    // not the outcome: four up with five minutes left, the home side can't be sold at 1.01 or better.
    const fourNil = at(4, 0, 5);
    expect(bookMarket(fourNil, "ALT_HANDICAP", -1.5)!.picks["1"]).toBeNull();
    expect(bookMarket(fourNil, "ALT_HANDICAP", -1.5)!.picks["2"]).toBe(26); // a 3-goal reply: the long-shot ceiling
    expect(bookMarket(fourNil, "BTTS")!.picks.BTTS_NO).not.toBeNull(); // away still has 5 minutes
    expect(bookMarket(at(1, 1, 30), "BTTS")!.picks.BTTS_YES).toBeNull(); // both have scored
  });

  it("suspends a market once nothing on it can be priced", () => {
    const closed = (book: ReturnType<typeof at>, type: Parameters<typeof bookMarket>[1], line?: number) =>
      Object.values(bookMarket(book, type, line)!.picks).every((o) => o === null);
    expect(closed(at(1, 1, 30), "BTTS")).toBe(true);
    expect(closed(at(2, 1, 30), "OVER_UNDER", 2.5)).toBe(true); // over 2.5 already won
    expect(closed(at(0, 0, 0), "MATCH_RESULT")).toBe(true); // full time: the draw is settled
    expect(closed(at(0, 0, 90), "MATCH_RESULT")).toBe(false);
  });

  it("never prices a pick at a loss, however short it gets", () => {
    for (const [h, a, left] of [[3, 0, 2], [0, 0, 1], [2, 2, 4], [1, 0, 8]] as const) {
      const probs = footballMarketProbs(h, a, (1.45 * left) / 90, (1.15 * left) / 90, { total: 2.5, handicap: -0.5 });
      for (const market of priceBook(probs))
        for (const [code, odds] of Object.entries(market.picks))
          if (odds !== null) {
            expect(odds).toBeGreaterThanOrEqual(1.01);
            expect(bookMarket(probs, market.type, market.line)!.picks[code]! * odds).toBeLessThan(1);
          }
    }
  });
});
