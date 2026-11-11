import { describe, it, expect } from "vitest";
import { LEAGUES, CLUBS, findClub, findLeague } from "../src/lib/crests/catalog";
import { renderClubCrest, renderLeagueCrest } from "../src/lib/crests/render";

describe("crests catalog", () => {
  it("has 10 leagues of 5 clubs each", () => {
    expect(LEAGUES).toHaveLength(10);
    for (const l of LEAGUES) expect(l.clubs).toHaveLength(5);
    expect(CLUBS).toHaveLength(50);
  });

  it("every club name is unique", () => {
    const names = CLUBS.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("every league code is unique", () => {
    const codes = LEAGUES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("findClub looks up case-insensitively", () => {
    const club = findClub("Port Aurel Mariners");
    expect(club).toBeDefined();
    expect(club!.name).toBe("Port Aurel Mariners");
    expect(findClub("PORT AUREL MARINERS")).toBe(club);
    expect(findClub("nonexistent")).toBeUndefined();
  });

  it("findLeague looks up case-insensitively", () => {
    const league = findLeague("Kestria Super League");
    expect(league).toBeDefined();
    expect(findLeague("nonexistent")).toBeUndefined();
  });
});

describe("crests render", () => {
  it("renders a club crest as valid SVG", () => {
    const club = CLUBS[0]!;
    const svg = renderClubCrest(club);
    expect(svg).toContain("<svg");
    expect(svg).toContain(club.name.toUpperCase());
    expect(svg).toContain(`EST. ${club.founded}`);
  });

  it("renders a league crest as valid SVG", () => {
    const league = LEAGUES[0]!;
    const svg = renderLeagueCrest(league);
    expect(svg).toContain("<svg");
    expect(svg).toContain(league.name.toUpperCase());
  });

  it("each of the 4 shapes produces different outlines", () => {
    const base = { town: "Test", founded: 2000, pattern: "plain" as const, emblem: "ball" as const, colors: ["#111", "#222"] as [string, string], metal: "gold" as const };
    const shapes = (["shield", "round", "heater", "modern"] as const).map((shape) => renderClubCrest({ ...base, shape, name: `${shape} FC` }));
    const unique = new Set(shapes);
    expect(unique.size).toBe(4);
  });
});
