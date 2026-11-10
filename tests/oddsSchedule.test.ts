import { describe, expect, it } from "vitest";
import { leagueRefreshMs, pickDueLeagues } from "../src/lib/oddsSchedule";

const H = 60 * 60 * 1000;

describe("leagueRefreshMs", () => {
  it("refreshes faster as kickoff nears", () => {
    expect(leagueRefreshMs(30 * 60 * 1000)).toBe(1 * H);
    expect(leagueRefreshMs(3 * H)).toBe(1 * H);
    expect(leagueRefreshMs(10 * H)).toBe(2 * H);
    expect(leagueRefreshMs(48 * H)).toBe(6 * H);
    expect(leagueRefreshMs(5 * 24 * H)).toBe(12 * H);
    expect(leagueRefreshMs(null)).toBe(24 * H);
  });
});

describe("pickDueLeagues", () => {
  const now = 1_000 * H;
  const leagues = ["epl", "nba", "ucl", "liga"];
  const next = new Map([
    ["epl", 2 * H], // 1h cadence
    ["nba", 10 * H], // 2h cadence
    ["ucl", 5 * 24 * H], // 12h cadence
    // liga: nothing scheduled -> 24h cadence
  ]);

  it("treats never-refreshed leagues as due", () => {
    expect(pickDueLeagues(leagues, next, new Map(), now)).toEqual(leagues);
  });

  it("only picks leagues whose cadence has elapsed", () => {
    const last = new Map([
      ["epl", now - 1 * H], // due
      ["nba", now - 1 * H], // not due (2h)
      ["ucl", now - 11 * H], // not due (12h)
      ["liga", now - 25 * H], // due
    ]);
    expect(pickDueLeagues(leagues, next, last, now)).toEqual(["epl", "liga"]);
  });

  it("tolerates a little timer drift", () => {
    const last = new Map([["epl", now - 1 * H + 5_000]]);
    expect(pickDueLeagues(["epl"], next, last, now)).toEqual(["epl"]);
  });
});
