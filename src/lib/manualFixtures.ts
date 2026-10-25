/**
 * Games created by an admin (friendlies, local leagues the feed doesn't cover). They have no
 * providerRef, so the odds sync, live scores and auto-settlement never touch them: the admin
 * sets the prices and settles (or voids) them from the console.
 */
import type { MarketType } from "@prisma/client";
import { prisma } from "./db";
import { toMilliOdds } from "./money";
import { applyCachedBadges } from "./assets";
import type { ManualFixtureInput } from "./validation";

type MarketSpec = { type: MarketType; name: string; line?: number; selections: { code: string; name: string; odds: number }[] };

function marketsFor(f: ManualFixtureInput): MarketSpec[] {
  const out: MarketSpec[] = [];
  if (f.sportKey === "football")
    out.push({
      type: "MATCH_RESULT",
      name: "Match Result",
      selections: [
        { code: "1", name: "Home", odds: f.result.home },
        { code: "X", name: "Draw", odds: f.result.draw! },
        { code: "2", name: "Away", odds: f.result.away },
      ],
    });
  else
    out.push({
      type: "MONEYLINE",
      name: "Match Winner",
      selections: [
        { code: "1", name: "Home", odds: f.result.home },
        { code: "2", name: "Away", odds: f.result.away },
      ],
    });
  if (f.total)
    out.push({
      type: "OVER_UNDER",
      name: f.sportKey === "basketball" ? "Total Points" : "Total Goals",
      line: f.total.line,
      selections: [
        { code: "OVER", name: `Over ${f.total.line}`, odds: f.total.over },
        { code: "UNDER", name: `Under ${f.total.line}`, odds: f.total.under },
      ],
    });
  if (f.btts)
    out.push({
      type: "BTTS",
      name: "Both Teams To Score",
      selections: [
        { code: "BTTS_YES", name: "Yes", odds: f.btts.yes },
        { code: "BTTS_NO", name: "No", odds: f.btts.no },
      ],
    });
  return out;
}

export async function createManualFixture(f: ManualFixtureInput): Promise<{ id: string; code: number }> {
  const sportName = f.sportKey === "football" ? "Football" : "Basketball";
  const fixture = await prisma.$transaction(async (tx) => {
    await tx.sport.upsert({ where: { key: f.sportKey }, create: { key: f.sportKey, name: sportName }, update: {} });
    const competition = await tx.competition.upsert({
      where: { sportKey_name: { sportKey: f.sportKey, name: f.competition } },
      create: { sportKey: f.sportKey, name: f.competition },
      update: {},
    });
    const created = await tx.fixture.create({
      data: {
        sportKey: f.sportKey,
        competitionId: competition.id,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        venue: f.venue,
        startsAt: new Date(f.startsAt),
        status: "SCHEDULED",
      },
    });
    for (const m of marketsFor(f))
      await tx.market.create({
        data: {
          fixtureId: created.id,
          type: m.type,
          name: m.name,
          line: m.line ?? null,
          status: "OPEN",
          selections: { create: m.selections.map((s) => ({ code: s.code, name: s.name, milliOdds: toMilliOdds(s.odds), status: "OPEN" })) },
        },
      });
    return created;
  });
  await applyCachedBadges(); // known teams pick up their crest straight away
  return { id: fixture.id, code: fixture.code };
}
