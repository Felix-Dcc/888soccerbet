import { describe, it, expect } from "vitest";
import { liveClockLabel, matchRealMinutes, MATCH_TIMING } from "../src/lib/liveClock";

const at = (min: number) => liveClockLabel("football", 0, min * 60_000);

describe("liveClockLabel (football)", () => {
  it("counts up, shows stoppage and half-time, then stops at the final whistle", () => {
    expect(at(-1)).toBeNull(); // not kicked off
    expect(at(0)).toBe("1'");
    expect(at(22.5)).toBe("23'");
    expect(at(44.9)).toBe("45'");
    expect(at(45.5)).toBe("45+1'"); // first-half stoppage (add1 = 2)
    expect(at(46.5)).toBe("45+2'");
    expect(at(55)).toBe("HT"); // 15-minute interval
    expect(at(62.5)).toBe("46'"); // second half resumes at 46
    expect(at(106.9)).toBe("90'");
    expect(at(108)).toBe("90+1'"); // second-half stoppage (add2 = 4)
    expect(at(110.5)).toBe("90+4'");
    expect(at(matchRealMinutes("football"))).toBeNull(); // full time
  });

  it("keeps added time under 5 minutes a half", () => {
    expect(MATCH_TIMING.football.add1).toBeLessThan(5);
    expect(MATCH_TIMING.football.add2).toBeLessThan(5);
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
