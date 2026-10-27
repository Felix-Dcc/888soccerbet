import { afterEach, describe, expect, it, vi } from "vitest";
import { bonusPercent, bonusRules, multipleBonus, qualifyingLegs } from "../src/lib/bonus";

const legs = (...odds: number[]) => odds.map((o) => Math.round(o * 1000));

afterEach(() => vi.unstubAllEnvs());

describe("multiple bonus", () => {
  it("pays the rate for the number of qualifying legs, on top of the odds return", () => {
    // Five legs at 6%: GHS 100 at 8.1432 returns 814.32, so the bonus is 48.85.
    const five = legs(2.16, 1.45, 1.39, 1.45, 1.29);
    expect(qualifyingLegs(five, bonusRules())).toBe(5);
    expect(bonusPercent(5, bonusRules())).toBe(6);
    expect(multipleBonus(81432n, five)).toBe(4885n); // floored, never rounded up against the house
  });

  it("ignores legs priced below the minimum, and pays nothing without enough that qualify", () => {
    const r = bonusRules();
    expect(qualifyingLegs(legs(2.0, 1.05, 1.19, 1.2), r)).toBe(2); // 1.05 and 1.19 are too short
    expect(multipleBonus(100000n, legs(2.0, 1.05, 1.19))).toBe(0n); // one qualifying leg: no bonus
    expect(multipleBonus(100000n, legs(3.0))).toBe(0n); // a single never earns one
  });

  it("uses the highest rate at or below the leg count, and holds it above the top entry", () => {
    const r = bonusRules();
    expect(bonusPercent(2, r)).toBe(0);
    expect(bonusPercent(3, r)).toBe(3);
    expect(bonusPercent(11, r)).toBe(bonusPercent(10, r)); // no entry for 11: the 10-leg rate stands
    expect(bonusPercent(50, r)).toBe(bonusPercent(20, r)); // beyond the table, the top rate holds
  });

  it("is configurable, and an empty table turns it off everywhere", () => {
    vi.stubEnv("BONUS_TABLE", "2:10,4:25");
    vi.stubEnv("BONUS_MIN_ODDS", "1.5");
    const r = bonusRules();
    expect(qualifyingLegs(legs(2.0, 1.49, 1.5), r)).toBe(2);
    expect(multipleBonus(10000n, legs(2.0, 2.0), r)).toBe(1000n); // 10% of 100.00
    expect(multipleBonus(10000n, legs(2.0, 2.0, 2.0, 2.0), r)).toBe(2500n);

    vi.stubEnv("BONUS_TABLE", "");
    expect(multipleBonus(10000n, legs(2.0, 2.0, 2.0, 2.0, 2.0), bonusRules())).toBe(0n);
  });

  it("ignores junk in the table rather than pricing a bet on it", () => {
    vi.stubEnv("BONUS_TABLE", "3:5,oops,4:,:9,5:-2,6:8");
    const r = bonusRules();
    expect(r.table).toEqual([
      [3, 5],
      [6, 8],
    ]);
  });
});
