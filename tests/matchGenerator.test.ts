import { describe, it, expect } from "vitest";
import { generateMatch, inPlayFootballOdds } from "../src/lib/matchGenerator";
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

const book = (odds: number[]) => odds.reduce((sum, o) => sum + 1 / o, 0);

describe("house margin", () => {
  it("prices generated matches with the margin on the house's side (implied probabilities sum above 1)", () => {
    for (let i = 0; i < 60; i++) {
      const m = generateMatch("football");
      expect(book([m.result.home, m.result.draw!, m.result.away])).toBeGreaterThan(1);
      expect(book([m.total!.over, m.total!.under])).toBeGreaterThan(1);
    }
  });
});

describe("inPlayFootballOdds", () => {
  it("depends only on the score and minutes left: same inputs, same prices", () => {
    expect(inPlayFootballOdds(1, 1, 37, 2.5)).toEqual(inPlayFootballOdds(1, 1, 37, 2.5));
  });

  it("keeps the house margin on every market it prices", () => {
    for (const [h, a, left] of [[0, 0, 90], [1, 0, 60], [0, 2, 30], [2, 2, 15]] as const) {
      const o = inPlayFootballOdds(h, a, left, 3.5);
      if (o.result) expect(book(Object.values(o.result))).toBeGreaterThan(1.05);
      if (o.total) expect(book(Object.values(o.total))).toBeGreaterThan(1.05);
      if (o.btts) expect(book(Object.values(o.btts))).toBeGreaterThan(1.05);
    }
  });

  it("moves with the score and the clock", () => {
    const start = inPlayFootballOdds(0, 0, 90, 2.5);
    const late = inPlayFootballOdds(0, 0, 20, 2.5);
    expect(late.result!.X).toBeLessThan(start.result!.X); // goalless late on: the draw shortens
    expect(inPlayFootballOdds(1, 0, 60, 2.5).result!["1"]).toBeLessThan(start.result!["1"]); // a goal up: home shortens
  });

  it("suspends markets that are settled or nearly so instead of pricing them at the 1.08 floor", () => {
    expect(inPlayFootballOdds(1, 1, 30, 2.5).btts).toBeNull(); // both have scored
    expect(inPlayFootballOdds(2, 1, 30, 2.5).total).toBeNull(); // over 2.5 already won
    expect(inPlayFootballOdds(2, 0, 3, 2.5).result).toBeNull(); // two up with 3 minutes left
    expect(inPlayFootballOdds(0, 0, 0, 2.5)).toEqual({ result: null, total: null, btts: null });
  });
});
