import { describe, expect, it } from "vitest";
import { commissionOf } from "../src/lib/commission";

describe("commissionOf", () => {
  it("takes the rate in basis points of net deposits, rounded down to the pesewa", () => {
    expect(commissionOf(1_100n, 1_000)).toBe(110n); // 10% of GHS 11.00
    expect(commissionOf(999n, 250)).toBe(24n); // 2.5% of GHS 9.99 = 24.975 pesewas
    expect(commissionOf(50_000n, 10_000)).toBe(50_000n); // 100%
  });
  it("earns nothing at 0% or on a net loss", () => {
    expect(commissionOf(1_100n, 0)).toBe(0n);
    expect(commissionOf(0n, 1_000)).toBe(0n);
    expect(commissionOf(-5_000n, 1_000)).toBe(0n);
  });
});
