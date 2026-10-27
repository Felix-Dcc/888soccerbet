/**
 * Games created by an admin (friendlies, local leagues the feed doesn't cover). They have no
 * providerRef, so the odds sync, live scores and auto-settlement never touch them: the admin
 * sets the prices and settles (or voids) them from the console.
 */
import { Prisma, type MarketType } from "@prisma/client";
import type { MatchScript } from "./scriptedMatches";
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
  if (f.doubleChance)
    out.push({
      type: "DOUBLE_CHANCE",
      name: "Double Chance",
      selections: [
        { code: "1X", name: `${f.homeTeam} or Draw`, odds: f.doubleChance.homeDraw },
        { code: "12", name: `${f.homeTeam} or ${f.awayTeam}`, odds: f.doubleChance.homeAway },
        { code: "X2", name: `${f.awayTeam} or Draw`, odds: f.doubleChance.drawAway },
      ],
    });
  if (f.drawNoBet)
    out.push({
      type: "DRAW_NO_BET",
      name: "Draw No Bet",
      selections: [
        { code: "1", name: f.homeTeam, odds: f.drawNoBet.home },
        { code: "2", name: f.awayTeam, odds: f.drawNoBet.away },
      ],
    });
  if (f.oddEven)
    out.push({
      type: "ODD_EVEN",
      name: "Odd/Even",
      selections: [
        { code: "ODD", name: "Odd", odds: f.oddEven.odd },
        { code: "EVEN", name: "Even", odds: f.oddEven.even },
      ],
    });
  if (f.correctScore)
    out.push({
      type: "CORRECT_SCORE",
      name: "Correct Score",
      // Grid order (0-0, 0-1, ...), "Other" last.
      selections: Object.entries(f.correctScore)
        .sort(([a], [b]) => (a === "OTHER" ? 1 : b === "OTHER" ? -1 : a.localeCompare(b)))
        .map(([code, odds]) => ({ code, name: code === "OTHER" ? "Other" : code, odds })),
    });
  return out;
}

export async function createManualFixture(f: ManualFixtureInput, script?: MatchScript): Promise<{ id: string; code: number }> {
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
        script: script ? (script as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
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
  await applyCachedBadges(); // known teams pick up their real badge straight away
  await giveGeneratedCrests(fixture.id); // anything still without one (fictional sides) gets a drawn crest
  return { id: fixture.id, code: fixture.code };
}

/** Admin changes when a manual/generated game kicks off. Only manual games (no feed), not yet settled. Returns false if none matched. */
export async function rescheduleManualFixture(fixtureId: string, startsAtISO: string): Promise<boolean> {
  const startsAt = new Date(startsAtISO);
  const r = await prisma.fixture.updateMany({
    where: { id: fixtureId, providerRef: null, status: { in: ["SCHEDULED", "LIVE"] } },
    // Moved back into the future -> SCHEDULED again; moved to now/past -> let it run (LIVE or started-by-time).
    data: startsAt > new Date() ? { startsAt, status: "SCHEDULED" } : { startsAt },
  });
  return r.count > 0;
}

/** A team the feed has no badge for still needs a crest; ours is drawn from the name. */
export const crestUrl = (team: string) => `/api/crest/${encodeURIComponent(team)}`;

/** Fill in a drawn crest for either side of a manual game that has no real badge. */
async function giveGeneratedCrests(fixtureId: string): Promise<void> {
  const f = await prisma.fixture.findUnique({ where: { id: fixtureId }, select: { homeTeam: true, awayTeam: true, homeTeamLogo: true, awayTeamLogo: true } });
  if (!f) return;
  const data = {
    ...(f.homeTeamLogo ? {} : { homeTeamLogo: crestUrl(f.homeTeam) }),
    ...(f.awayTeamLogo ? {} : { awayTeamLogo: crestUrl(f.awayTeam) }),
  };
  if (Object.keys(data).length) await prisma.fixture.update({ where: { id: fixtureId }, data });
}
