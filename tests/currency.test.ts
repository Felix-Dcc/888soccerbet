import { describe, expect, it } from "vitest";
import { amountIn, GHS_CURRENCY, ghsNumber, localizeMessage, moneyIn, numberIn, pesewasFrom, unitOf, type Currency } from "../src/lib/currency";

const NGN: Currency = { code: "NGN", rate: 130 };

describe("player currency", () => {
  it("shows GHS players amounts as before", () => {
    expect(moneyIn(GHS_CURRENCY, 123450n)).toBe("GHS 1,234.50");
    expect(unitOf(GHS_CURRENCY)).toBe("GHS");
    expect(pesewasFrom(GHS_CURRENCY, 250)).toBe(25000n);
    expect(numberIn(GHS_CURRENCY, 25000n)).toBe(250);
    expect(localizeMessage(GHS_CURRENCY, "Minimum stake is 250 GHS")).toBe("Minimum stake is 250 GHS");
  });

  it("shows Nigerian players Naira at the rate, exactly", () => {
    expect(unitOf(NGN)).toBe("₦");
    expect(moneyIn(NGN, 25000n)).toBe("₦32,500.00"); // GHS 250
    expect(amountIn(NGN, 1n)).toBe("1.30"); // one pesewa is ₦1.30
    expect(numberIn(NGN, 25000n)).toBe(32500);
  });

  it("turns typed Naira into the nearest pesewa, and back into the API's GHS number", () => {
    expect(pesewasFrom(NGN, 32500)).toBe(25000n); // exact
    expect(pesewasFrom(NGN, "10000")).toBe(7692n); // ₦10,000 -> GHS 76.92
    expect(moneyIn(NGN, pesewasFrom(NGN, 10000))).toBe("₦9,999.60");
    expect(pesewasFrom(NGN, 0.65)).toBe(1n); // half a pesewa rounds up
    expect(pesewasFrom(NGN, 0.64)).toBe(0n);
    expect(ghsNumber(7692n)).toBe(76.92);
    expect(() => pesewasFrom(NGN, "abc")).toThrow();
  });

  it("rewrites GHS amounts in server messages for Nigerian players", () => {
    expect(localizeMessage(NGN, "Minimum stake is 250 GHS")).toBe("Minimum stake is ₦32,500.00");
    expect(localizeMessage(NGN, "The minimum cash out is GHS 1.00")).toBe("The minimum cash out is ₦130.00");
    expect(localizeMessage(NGN, "over your daily deposit limit of GHS 1,000.00")).toBe("over your daily deposit limit of ₦130,000.00");
    expect(localizeMessage(NGN, "Withdrawal limited to 10× your total deposits")).toBe("Withdrawal limited to 10× your total deposits");
  });

  it("falls back to GHS when no usable rate is set", () => {
    expect(moneyIn({ code: "NGN", rate: 0 }, 100n)).toBe("GHS 1.00");
  });
});
