import { describe, it, expect } from "vitest";
import { liveClockLabel, liveHalf, matchRealMinutes, MAX_STOPPAGE_MIN, stoppageFor } from "../src/lib/liveClock";

const KO = Date.UTC(2026, 10, 11, 18, 0); // any kick-off time
const at = (min: number) => liveClockLabel("football", KO, KO + min * 60_000);

describe("liveClockLabel (football)", () => {
  it("counts up, shows this match's stoppage and half-time, then stops at the final whistle", () => {
    const { add1, add2 } = stoppageFor("football", KO);
    const breakEnd = 45 + add1 + 15;
    expect(at(-1)).toBeNull(); // not kicked off
    expect(at(0)).toBe("1'");
    expect(at(22.5)).toBe("23'");
    expect(at(44.9)).toBe("45'");
    expect(at(45.5)).toBe("45+1'"); // first-half stoppage starts
    expect(at(45 + add1 - 0.5)).toBe(`45+${add1}'`); // ...and ends after add1 minutes
    expect(at(45 + add1 + 7.5)).toBe("HT"); // 15-minute interval
    expect(at(breakEnd + 0.5)).toBe("46'"); // second half resumes at 46
    expect(at(breakEnd + 44.9)).toBe("90'");
    expect(at(breakEnd + 45.5)).toBe("90+1'"); // second-half stoppage starts
    expect(at(breakEnd + 45 + add2 - 0.5)).toBe(`90+${add2}'`);
    expect(at(matchRealMinutes("football", KO))).toBeNull(); // full time
  });
});

describe("stoppageFor", () => {
  it("gives every football match 1-7 minutes a half, varying from match to match", () => {
    const seen1 = new Set<number>();
    const seen2 = new Set<number>();
    for (let m = 0; m < 5000; m++) {
      const ko = KO + m * 60_000;
      const { add1, add2 } = stoppageFor("football", ko);
      for (const a of [add1, add2]) {
        expect(Number.isInteger(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(MAX_STOPPAGE_MIN);
      }
      expect(stoppageFor("football", ko + 30_000)).toEqual({ add1, add2 }); // same kick-off minute, same added time
      seen1.add(add1);
      seen2.add(add2);
    }
    expect(MAX_STOPPAGE_MIN).toBe(7);
    expect(seen1.size).toBe(7); // every value 1..7 occurs
    expect(seen2.size).toBe(7);
  });

  it("adds nothing to basketball", () => {
    expect(stoppageFor("basketball", KO)).toEqual({ add1: 0, add2: 0 });
  });
});

describe("liveClockLabel (basketball)", () => {
  it("runs straight with no stoppage", () => {
    expect(liveClockLabel("basketball", 0, 12 * 60_000)).toBe("12'");
    expect(liveClockLabel("basketball", 0, 30 * 60_000)).toBe("HT"); // 24 + 10-min interval
    expect(liveClockLabel("basketball", 0, 40 * 60_000)).toBe("30'");
    expect(liveClockLabel("basketball", 0, 58 * 60_000)).toBeNull();
  });
});

describe("liveHalf", () => {
  it("tells the first half (stoppage included) from the second, and nothing at half-time", () => {
    expect(liveHalf("football", "23'")).toBe("H1");
    expect(liveHalf("football", "45'")).toBe("H1");
    expect(liveHalf("football", "45+2'")).toBe("H1");
    expect(liveHalf("football", "HT")).toBeNull();
    expect(liveHalf("football", "46'")).toBe("H2");
    expect(liveHalf("football", "90+3'")).toBe("H2");
    expect(liveHalf("basketball", "24'")).toBe("H1");
    expect(liveHalf("basketball", "25'")).toBe("H2");
  });
});
