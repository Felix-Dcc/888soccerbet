import { describe, it, expect } from "vitest";
import { generateMatch } from "../src/lib/matchGenerator";
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
