import { describe, it, expect } from "vitest";
import { toPesewas, formatPesewas, toMilliOdds, combineMilliOdds, potentialPayout } from "../src/lib/money";

describe("money conversion", () => {
  it("converts GHS to pesewas exactly", () => {
    expect(toPesewas(10)).toBe(1000n);
    expect(toPesewas("1.5")).toBe(150n);
    expect(toPesewas("0.01")).toBe(1n);
    expect(toPesewas("1234.56")).toBe(123456n);
  });
  it("rounds half-up at the pesewa", () => {
    expect(toPesewas("1.005")).toBe(101n); // 1.005 -> 1.01
    expect(toPesewas("1.004")).toBe(100n);
  });
  it("formats with grouping", () => {
    expect(formatPesewas(123456n)).toBe("1,234.56");
    expect(formatPesewas(5n)).toBe("0.05");
  });
  it("rejects junk", () => {
    expect(() => toPesewas("abc")).toThrow();
  });
});

describe("odds math", () => {
  it("converts decimal odds to milli", () => {
    expect(toMilliOdds(2.5)).toBe(2500);
    expect(toMilliOdds("1.01")).toBe(1010);
  });
  it("combines accumulator odds exactly", () => {
    expect(combineMilliOdds([2000])).toBe(2000); // single
    expect(combineMilliOdds([2000, 1500])).toBe(3000); // 2.0 * 1.5 = 3.0
    expect(combineMilliOdds([1500, 1500, 1500])).toBe(3375); // 1.5^3 = 3.375
  });
  it("computes payout floored, house-favourable", () => {
    expect(potentialPayout(1000n, 2500)).toBe(2500n); // 10 @ 2.5 = 25
    expect(potentialPayout(333n, 1010)).toBe(336n); // 333 * 1010 / 1000 = 336.33 -> 336
  });
});
