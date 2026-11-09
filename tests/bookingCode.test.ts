import { describe, expect, it } from "vitest";
import { bookingCode } from "../src/lib/ids";

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
