import { describe, it, expect } from "vitest";
import { buildScript, scoreAt, scriptLengthMin } from "../src/lib/scriptedMatches";
import { generateScoreline } from "../src/lib/matchGenerator";
import { stoppageFor } from "../src/lib/liveClock";

const KO = Date.UTC(2026, 10, 11, 18, 0); // any kick-off time

describe("buildScript", () => {
  it("refuses a full-time score below half time", () => {
    expect(() => buildScript("football", [2, 0], [1, 0])).toThrow();
    expect(() => buildScript("football", [0, 2], [0, 1])).toThrow();
  });

  it("puts first-half goals before the break and the rest after", () => {
    const s = buildScript("football", [2, 1], [3, 2]);
    expect(s.goals).toHaveLength(5);
    expect(s.goals.filter((g) => g.m <= s.halfMin)).toHaveLength(3); // 2-1 at the interval
    for (const g of s.goals) expect(g.m).toBeGreaterThanOrEqual(1), expect(g.m).toBeLessThanOrEqual(s.fullMin);
  });
});

describe("scriptLengthMin", () => {
  it("is 90 minutes + the interval + this match's added time, which is at most 7 a half", () => {
    const s = buildScript("football", [1, 0], [2, 1]);
    for (let m = 0; m < 500; m++) {
      const ko = KO + m * 60_000;
      const { add1, add2 } = stoppageFor("football", ko);
      expect(scriptLengthMin(s, ko)).toBe(90 + 15 + add1 + add2);
      expect(scriptLengthMin(s, ko)).toBeLessThanOrEqual(90 + 15 + 7 + 7);
    }
    expect(scriptLengthMin(buildScript("basketball", [50, 48], [103, 99]), KO)).toBe(48 + 10); // no added time
  });
});

describe("scoreAt", () => {
  it("walks a football match from 0-0 to the scripted result", () => {
    const s = buildScript("football", [2, 1], [3, 2]);
    expect(scoreAt(s, 0, KO)).toMatchObject({ home: 0, away: 0, finished: false });
    expect(scoreAt(s, s.halfMin, KO)).toMatchObject({ home: 2, away: 1, finished: false }); // half time
    expect(scoreAt(s, s.halfMin + s.breakMin / 2, KO)).toMatchObject({ home: 2, away: 1 }); // frozen through the interval
    expect(scoreAt(s, scriptLengthMin(s, KO) - 0.5, KO)).toMatchObject({ finished: false }); // still in added time
    expect(scoreAt(s, scriptLengthMin(s, KO), KO)).toEqual({ home: 3, away: 2, finished: true });
    expect(scoreAt(s, scriptLengthMin(s, KO) + 500, KO)).toEqual({ home: 3, away: 2, finished: true });
  });

  it("never goes backwards and ends exactly on the scripted score", () => {
    for (const sport of ["football", "basketball"] as const) {
      const { ht, ft } = generateScoreline(sport);
      const s = buildScript(sport, ht, ft);
      let [ph, pa] = [0, 0];
      for (let m = 0; m <= scriptLengthMin(s, KO); m += 0.5) {
        const r = scoreAt(s, m, KO);
        expect(r.home).toBeGreaterThanOrEqual(ph);
        expect(r.away).toBeGreaterThanOrEqual(pa);
        expect(r.home).toBeLessThanOrEqual(ft[0]);
        expect(r.away).toBeLessThanOrEqual(ft[1]);
        [ph, pa] = [r.home, r.away];
      }
      expect(scoreAt(s, scriptLengthMin(s, KO), KO)).toEqual({ home: ft[0], away: ft[1], finished: true });
    }
  });

  it("ramps basketball points and hits the half-time score at the interval", () => {
    const s = buildScript("basketball", [50, 48], [103, 99]);
    expect(scoreAt(s, 0, KO)).toMatchObject({ home: 0, away: 0 });
    expect(scoreAt(s, s.halfMin, KO)).toMatchObject({ home: 50, away: 48 });
    const mid = scoreAt(s, s.halfMin / 2, KO);
    expect(mid.home).toBeGreaterThan(0);
    expect(mid.home).toBeLessThan(50);
  });

  it("keeps a goalless match at 0-0 throughout", () => {
    const s = buildScript("football", [0, 0], [0, 0]);
    expect(scoreAt(s, 20, KO)).toMatchObject({ home: 0, away: 0, finished: false });
    expect(scoreAt(s, scriptLengthMin(s, KO), KO)).toEqual({ home: 0, away: 0, finished: true });
  });
});
