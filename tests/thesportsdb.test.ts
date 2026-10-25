import { describe, it, expect } from "vitest";
import { mapEvent, kickoffIso, isFinished, type SdbEvent } from "../src/lib/providers/odds/thesportsdb";

// A real recorded TheSportsDB event (captured from the live API). This is a RECORDED
// fixture test — it does NOT call the live provider.
const RECORDED: SdbEvent = {
  idEvent: "2494075",
  strHomeTeam: "Ipswich Town",
  strAwayTeam: "Nottingham Forest",
  strTimestamp: "2026-10-23T19:00:00",
  dateEvent: "2026-10-23",
  strTime: "19:00:00",
  strVenue: "Portman Road",
  strStatus: "NS",
  strLeague: "English Premier League",
  strSeason: "2026-2027",
  strHomeTeamBadge: "https://r2.thesportsdb.com/images/media/team/badge/mdj1ey1634670785.png",
  strAwayTeamBadge: "https://r2.thesportsdb.com/images/media/team/badge/sar2y41781740886.png",
};

describe("TheSportsDB mapping", () => {
  it("maps a recorded event to a ProviderFixture with real metadata and NO odds", () => {
    const fx = mapEvent(RECORDED, "football")!;
    expect(fx.providerRef).toBe("sdb-2494075");
    expect(fx.homeTeam).toBe("Ipswich Town");
    expect(fx.awayTeam).toBe("Nottingham Forest");
    expect(fx.competition).toBe("English Premier League");
    expect(fx.venue).toBe("Portman Road");
    expect(fx.homeTeamLogo).toContain("thesportsdb.com");
    expect(fx.markets).toEqual([]); // data feed supplies no odds — never fabricated
  });

  it("treats the timestamp as UTC", () => {
    expect(kickoffIso(RECORDED)).toBe("2026-10-23T19:00:00.000Z");
  });

  it("falls back to dateEvent + strTime when no timestamp", () => {
    expect(kickoffIso({ ...RECORDED, strTimestamp: null })).toBe("2026-10-23T19:00:00.000Z");
  });

  it("drops postponed and unschedulable events", () => {
    expect(mapEvent({ ...RECORDED, strPostponed: "yes" }, "football")).toBeNull();
    expect(mapEvent({ ...RECORDED, strTimestamp: null, dateEvent: null }, "football")).toBeNull();
  });

  it("recognises finished statuses only", () => {
    expect(isFinished("FT")).toBe(true);
    expect(isFinished("Match Finished")).toBe(true);
    expect(isFinished("NS")).toBe(false);
    expect(isFinished(null)).toBe(false);
  });
});
