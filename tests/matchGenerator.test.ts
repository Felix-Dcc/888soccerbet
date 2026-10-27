import { describe, it, expect } from "vitest";
import { footballMarketProbs, generateMatch, inPlayFootballOdds, priceBook } from "../src/lib/matchGenerator";
import { manualFixtureSchema } from "../src/lib/validation";

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
      for (const o of odds) expect(o).toBeGreaterThanOrEqual(1.08), expect(o).toBeLessThanOrEqual(26);
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

const book = (odds: (number | null)[]) => odds.reduce<number>((sum, o) => sum + 1 / o!, 0);

describe("house margin", () => {
  it("prices generated matches with the margin on the house's side (implied probabilities sum above 1)", () => {
    for (let i = 0; i < 60; i++) {
      const m = generateMatch("football");
      expect(book([m.result.home, m.result.draw!, m.result.away])).toBeGreaterThan(1);
      expect(book([m.total!.over, m.total!.under])).toBeGreaterThan(1);
    }
  });
});

describe("generated football markets", () => {
  it("offers double chance, draw no bet, odd/even and all 26 correct scores, each with a house margin", () => {
    for (let i = 0; i < 60; i++) {
      const m = generateMatch("football");
      expect(Object.keys(m.correctScore!)).toHaveLength(26);
      expect(m.correctScore).toHaveProperty("4-4");
      expect(m.correctScore).toHaveProperty("OTHER");
      for (const odds of [Object.values(m.doubleChance!), Object.values(m.drawNoBet!), Object.values(m.oddEven!), Object.values(m.correctScore!), Object.values(m.btts!)])
        expect(book(odds)).toBeGreaterThan(1);
    }
  });

  it("gives basketball odd/even only", () => {
    const m = generateMatch("basketball");
    expect(m.oddEven).toBeDefined();
    expect(m.correctScore ?? m.doubleChance ?? m.drawNoBet).toBeUndefined();
  });

  /**
   * No arbitrage across markets: if one distribution over final scores makes every pick worth less
   * than its stake, no set of picks can pay out more than it costs in every outcome. Every price
   * comes from footballMarketProbs, so check each pick's expected return under it is below 1.
   */
  it("never lets a set of picks across markets win in every outcome", () => {
    const cases: [number, number, number, number, number][] = [];
    for (let i = 0; i < 40; i++) cases.push([0, 0, 1 + Math.random(), 0.6 + Math.random(), 2.5]); // pre-match
    for (const [h, a] of [[0, 0], [1, 0], [0, 2], [2, 2], [3, 1]] as const) for (const left of [80, 45, 20, 5]) cases.push([h, a, (1.45 * left) / 90, (1.15 * left) / 90, 3.5]);
    for (const [h, a, mh, ma, line] of cases) {
      const probs = footballMarketProbs(h, a, mh, ma, line);
      const prices = priceBook(probs);
      const draw = probs.MATCH_RESULT!.X!;
      for (const [type, picks] of Object.entries(prices)) {
        if (!picks) continue;
        for (const [code, odds] of Object.entries(picks)) {
          if (odds === null) continue;
          const p = probs[type as keyof typeof probs]![code]!;
          // Draw no bet refunds on a draw: return = P(no draw) * P(win | no draw) * odds + P(draw).
          const ret = type === "DRAW_NO_BET" ? (1 - draw) * p * odds + draw : p * odds;
          expect(ret, `${type} ${code} at ${h}-${a}`).toBeLessThan(1);
        }
        expect(book(Object.values(picks).filter((o) => o !== null)), type).toBeGreaterThan(1);
      }
    }
  });
});

describe("inPlayFootballOdds", () => {
  it("depends only on the score and minutes left: same inputs, same prices", () => {
    expect(inPlayFootballOdds(1, 1, 37, 2.5)).toEqual(inPlayFootballOdds(1, 1, 37, 2.5));
  });

  it("moves with the score and the clock", () => {
    const start = inPlayFootballOdds(0, 0, 90, 2.5);
    const late = inPlayFootballOdds(0, 0, 20, 2.5);
    expect(late.MATCH_RESULT!.X!).toBeLessThan(start.MATCH_RESULT!.X!); // goalless late on: the draw shortens
    expect(inPlayFootballOdds(1, 0, 60, 2.5).MATCH_RESULT!["1"]!).toBeLessThan(start.MATCH_RESULT!["1"]!); // a goal up: home shortens
  });

  it("closes picks the score has ruled out, and markets that are settled or nearly so", () => {
    const oneNil = inPlayFootballOdds(1, 0, 70, 2.5);
    expect(oneNil.CORRECT_SCORE!["0-0"]).toBeNull();
    expect(oneNil.CORRECT_SCORE!["0-1"]).toBeNull();
    expect(oneNil.CORRECT_SCORE!["1-0"]).not.toBeNull();
    expect(oneNil.CORRECT_SCORE!["2-1"]).not.toBeNull();
    expect(inPlayFootballOdds(1, 1, 30, 2.5).BTTS).toBeNull(); // both have scored
    expect(inPlayFootballOdds(2, 1, 30, 2.5).OVER_UNDER).toBeNull(); // over 2.5 already won
    const twoUpLate = inPlayFootballOdds(2, 0, 3, 2.5);
    expect(twoUpLate.MATCH_RESULT).toBeNull();
    expect(twoUpLate.DOUBLE_CHANCE).toBeNull();
    expect(twoUpLate.DRAW_NO_BET).toBeNull();
    expect(Object.values(inPlayFootballOdds(0, 0, 0, 2.5)).every((m) => m === null)).toBe(true);
  });
});
