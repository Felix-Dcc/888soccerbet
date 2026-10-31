import { describe, it, expect, afterEach } from "vitest";
import { normalizePhone, isAdult, extendSelfExclusion } from "../src/lib/accounts";
import { isBettable } from "../src/lib/markets";
import { normaliseCode } from "../src/lib/ids";
import { registerSchema, withdrawSchema } from "../src/lib/validation";
import { isTestAccount } from "../src/lib/demoCleanup";

describe("normalizePhone", () => {
  it("accepts local, 233 and +233 forms with separators", () => {
    expect(normalizePhone("0241234567")).toBe("0241234567");
    expect(normalizePhone("024 123 4567")).toBe("0241234567");
    expect(normalizePhone("+233 24 123 4567")).toBe("0241234567");
    expect(normalizePhone("233241234567")).toBe("0241234567");
    expect(normalizePhone("(024)-123-4567")).toBe("0241234567");
  });
  it("rejects wrong lengths and non-numbers", () => {
    expect(normalizePhone("024123456")).toBeNull();
    expect(normalizePhone("02412345678")).toBeNull();
    expect(normalizePhone("+44 7700 900123")).toBeNull();
    expect(normalizePhone("me@example.com")).toBeNull();
  });
});

describe("isAdult", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("is true from the 18th birthday onwards", () => {
    expect(isAdult(new Date("2008-10-23T00:00:00Z"), now)).toBe(true);
    expect(isAdult(new Date("2008-10-24T00:00:00Z"), now)).toBe(false);
  });
});

describe("isBettable", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const later = "2026-10-23T13:00:00Z";
  const earlier = "2026-10-23T11:00:00Z";
  afterEach(() => delete process.env.LIVE_BETTING);

  it("allows upcoming fixtures", () => {
    expect(isBettable({ status: "SCHEDULED", startsAt: later, oddsAt: null }, now)).toBe(true);
  });
  it("closes started fixtures without a live feed, whatever their stored status", () => {
    expect(isBettable({ status: "SCHEDULED", startsAt: earlier, oddsAt: null }, now)).toBe(false);
    expect(isBettable({ status: "LIVE", startsAt: earlier, oddsAt: null }, now)).toBe(false);
  });
  it("allows LIVE fixtures only when LIVE_BETTING=true and their odds are fresh", () => {
    process.env.LIVE_BETTING = "true";
    const ago = (s: number) => new Date(now.getTime() - s * 1000);
    expect(isBettable({ status: "LIVE", startsAt: earlier, oddsAt: ago(30) }, now)).toBe(true);
    expect(isBettable({ status: "LIVE", startsAt: earlier, oddsAt: ago(91) }, now)).toBe(false); // older than 90s default
    expect(isBettable({ status: "LIVE", startsAt: earlier, oddsAt: null }, now)).toBe(false); // cleared by a goal
    expect(isBettable({ status: "SCHEDULED", startsAt: earlier, oddsAt: null }, now)).toBe(false);
  });
  it("never allows finished or cancelled fixtures", () => {
    process.env.LIVE_BETTING = "true";
    expect(isBettable({ status: "FINISHED", startsAt: later, oddsAt: null }, now)).toBe(false);
    expect(isBettable({ status: "CANCELLED", startsAt: later, oddsAt: null }, now)).toBe(false);
  });
});

describe("normaliseCode", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normaliseCode(" ab-cd 12 ")).toBe("ABCD12");
  });
});

describe("sign-up consent", () => {
  const base = { name: "Kofi Boateng", email: "a@b.gh", password: "password1", confirmPassword: "password1", phone: "0241234567", dateOfBirth: "1990-01-01" };
  it("is required: the box must be ticked", () => {
    expect(registerSchema.safeParse(base).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptTerms: "true" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptTerms: true }).success).toBe(true);
  });
  it("needs a name, trimmed, and drops fields it doesn't know", () => {
    expect(registerSchema.safeParse({ ...base, acceptTerms: true, name: " " }).success).toBe(false);
    const r = registerSchema.safeParse({ ...base, acceptTerms: true, name: "  Kofi Boateng ", role: "ADMIN" });
    expect(r.success && r.data.name).toBe("Kofi Boateng");
    expect(r.success && "role" in r.data).toBe(false);
  });
});

describe("self-exclusion", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const day = 86_400_000;
  it("starts or extends, but is never cut short", () => {
    expect(extendSelfExclusion(null, 7, now).getTime()).toBe(now.getTime() + 7 * day);
    const thirty = new Date(now.getTime() + 30 * day);
    expect(extendSelfExclusion(thirty, 1, now)).toBe(thirty); // asking for 24h can't end a 30-day exclusion early
    expect(extendSelfExclusion(new Date(now.getTime() - day), 1, now).getTime()).toBe(now.getTime() + day); // an expired one restarts
  });
});

describe("demo cleanup: test accounts", () => {
  it("matches the live test sign-ups exactly, never a real look-alike", () => {
    for (const e of ["gggg@gmail.com", "RON@gmail.com", "walk692@t.gh", "demo@888soccerbet.com", "partner.e2e@example.test"]) expect(isTestAccount(e)).toBe(true);
    for (const e of ["ronappling56@gmail.com", "williamsmery81@gmail.com", "yjdehie@gmail.com", "j98700367@gmail.com", "n33849079@gmail.com", "admin@888soccerbet.com", "ron@gmail.com.gh", "aron@gmail.com"])
      expect(isTestAccount(e)).toBe(false);
  });
});

describe("withdrawal request", () => {
  const base = { amountGhs: 50, idempotencyKey: "a".repeat(12), msisdn: "0241234567", network: "MTN" };
  it("needs the name on the mobile money account, trimmed", () => {
    expect(withdrawSchema.safeParse(base).success).toBe(false);
    expect(withdrawSchema.safeParse({ ...base, accountName: " " }).success).toBe(false);
    expect(withdrawSchema.safeParse({ ...base, accountName: "K" }).success).toBe(false);
    const r = withdrawSchema.safeParse({ ...base, accountName: "  Kofi Mensah " });
    expect(r.success && r.data.accountName).toBe("Kofi Mensah");
  });
});
