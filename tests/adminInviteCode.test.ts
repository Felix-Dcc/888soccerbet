import { describe, expect, it } from "vitest";
import { adminInviteCode } from "../src/lib/ids";

describe("adminInviteCode", () => {
  it("is 12 unambiguous symbols mixing letters and digits, and doesn't repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = adminInviteCode();
      expect(c).toMatch(/^[ACDEFGHJKLMNPQRSTUVWXYZ2345679]{12}$/);
      expect(c).toMatch(/[0-9]/);
      expect(c).toMatch(/[A-Z]/);
      seen.add(c);
    }
    expect(seen.size).toBe(500);
  });
});
