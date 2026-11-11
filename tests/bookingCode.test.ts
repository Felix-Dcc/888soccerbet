import { describe, expect, it } from "vitest";
import { adminReferralCode, bookingCode } from "../src/lib/ids";

describe("bookingCode", () => {
  it("is always exactly 6 characters mixing letters and numbers, from the unambiguous set", () => {
    for (let i = 0; i < 2000; i++) {
      const c = bookingCode();
      expect(c).toMatch(/^[ACDEFGHJKLMNPQRSTUVWXYZ2345679]{6}$/);
      expect(c).toMatch(/[0-9]/);
      expect(c).toMatch(/[A-Z]/);
    }
  });
});

describe("adminReferralCode", () => {
  it("is always exactly 8 characters mixing letters and numbers, like AE9MC1PK", () => {
    for (let i = 0; i < 2000; i++) {
      const c = adminReferralCode();
      expect(c).toMatch(/^[ACDEFGHJKLMNPQRSTUVWXYZ2345679]{8}$/);
      expect(c).toMatch(/[0-9]/);
      expect(c).toMatch(/[A-Z]/);
    }
  });
});
