import { describe, it, expect } from "vitest";
import { normName, pickTeam, type SdbTeam } from "../src/lib/assets";
import { sized } from "../src/lib/images";

const team = (over: Partial<SdbTeam>): SdbTeam => ({ idTeam: "1", strTeam: "X", strSport: "Soccer", strBadge: "b", ...over });

describe("normName", () => {
  it("ignores accents, punctuation, '&' vs 'and' and club suffixes", () => {
    expect(normName("Atlético Madrid")).toBe("atletico madrid");
    expect(normName("Brighton & Hove Albion FC")).toBe(normName("Brighton and Hove Albion"));
    expect(normName("Borussia Mönchengladbach")).toBe(normName("Borussia Monchengladbach"));
  });
});

describe("pickTeam", () => {
  it("rejects a same-name team from another sport (the free API's netball 'Nottingham Forest')", () => {
    expect(pickTeam([team({ strTeam: "Nottingham Forest", strSport: "Netball" })], "Nottingham Forest", "football")).toBeNull();
  });
  it("accepts an exact match in the right sport, including via alternate names", () => {
    expect(pickTeam([team({ strTeam: "Atlético Madrid" })], "Atletico Madrid", "football")?.idTeam).toBe("1");
    expect(pickTeam([team({ strTeam: "Wolverhampton Wanderers", strTeamAlternate: "Wolves, WWFC" })], "Wolves", "football")).not.toBeNull();
    expect(pickTeam([team({ strTeam: "Milwaukee Bucks", strSport: "Basketball" })], "Milwaukee Bucks", "basketball")).not.toBeNull();
  });
  it("rejects partial name matches and ambiguous results", () => {
    expect(pickTeam([team({ strTeam: "Manchester City Women" })], "Manchester City", "football")).toBeNull();
    expect(pickTeam([team({ idTeam: "1", strTeam: "Inter" }), team({ idTeam: "2", strTeam: "Inter" })], "Inter", "football")).toBeNull();
  });
  it("rejects unknown sports", () => {
    expect(pickTeam([team({ strTeam: "Lions", strSport: "Rugby" })], "Lions", "rugby")).toBeNull();
  });
});

describe("sized", () => {
  it("appends size only for TheSportsDB images", () => {
    expect(sized("https://r2.thesportsdb.com/images/a.png", "tiny")).toBe("https://r2.thesportsdb.com/images/a.png/tiny");
    expect(sized("https://cdn.example.com/a.png", "tiny")).toBe("https://cdn.example.com/a.png");
    expect(sized(null, "tiny")).toBeNull();
    expect(sized("not a url", "tiny")).toBeNull();
  });
});
