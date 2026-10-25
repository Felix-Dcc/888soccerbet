import { describe, it, expect } from "vitest";
import { quoteCashout, type QuoteLeg } from "../src/lib/cashout";

const later = new Date(Date.now() + 3600_000);
const leg = (placed: number, current: number, over: Partial<QuoteLeg> = {}): QuoteLeg => ({
  status: "OPEN",
  milliOddsAtPlacement: placed,
  selection: { milliOdds: current, status: "OPEN", market: { status: "OPEN" } },
  fixture: { status: "SCHEDULED", startsAt: later },
  ...over,
});
const bet = (stakeGhs: number) => ({ status: "PENDING" as const, stake: BigInt(stakeGhs * 100) });
const offer = (q: ReturnType<typeof quoteCashout>) => (q.available ? q.offer : q.reason);

describe("cash out pricing", () => {
  it("unchanged odds: stake back less the 5% margin", () => {
    expect(offer(quoteCashout(bet(100), [leg(2000, 2000)], new Date(), 500n))).toBe(9500n); // GHS 95.00
  });

  it("odds shortened (more likely to win): offer rises", () => {
    // payout 200 / current 1.25 = 160, less 5% = 152.00
    expect(offer(quoteCashout(bet(100), [leg(2000, 1250)], new Date(), 500n))).toBe(15200n);
  });

  it("odds drifted: offer falls", () => {
    // payout 200 / 4.00 = 50, less 5% = 47.50
    expect(offer(quoteCashout(bet(100), [leg(2000, 4000)], new Date(), 500n))).toBe(4750n);
  });

  it("multiple with a leg already won: that leg keeps its placed odds", () => {
    // payout 10 x 2.00 x 3.00 = 60; open leg now 1.50 -> 60 / 1.5 = 40, less 5% = 38.00
    const q = quoteCashout(bet(10), [leg(2000, 2000, { status: "WON" }), leg(3000, 1500)], new Date(), 500n);
    expect(offer(q)).toBe(3800n);
  });

  it("void legs count as 1.00", () => {
    const q = quoteCashout(bet(10), [leg(2000, 2000, { status: "VOID" }), leg(3000, 3000)], new Date(), 500n);
    expect(offer(q)).toBe(950n); // 10 x 3 / 3 x 0.95
  });

  it("never offers more than the potential win", () => {
    const q = quoteCashout(bet(100), [leg(1500, 1000)], new Date(), 0n);
    expect(offer(q)).toBe(15000n);
  });

  it("is unavailable while a match is in play, when suspended, after a loss, when settled, or under GHS 1", () => {
    const started = { fixture: { status: "LIVE", startsAt: new Date(Date.now() - 60_000) } };
    expect(offer(quoteCashout(bet(10), [leg(2000, 2000, started)]))).toMatch(/in play/);
    expect(offer(quoteCashout(bet(10), [leg(2000, 2000, { selection: { milliOdds: 2000, status: "SUSPENDED", market: { status: "OPEN" } } })]))).toMatch(/Suspended/);
    expect(offer(quoteCashout(bet(10), [leg(2000, 2000, { status: "LOST" }), leg(2000, 2000)]))).toMatch(/lost/);
    expect(offer(quoteCashout({ status: "WON", stake: 1000n }, [leg(2000, 2000)]))).toMatch(/settled/);
    expect(offer(quoteCashout(bet(1), [leg(2000, 20000)]))).toMatch(/Below GHS 1/);
  });
});
