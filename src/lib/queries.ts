import { prisma } from "./db";
import { isBettable } from "./markets";

export interface UiSelection {
  id: string;
  code: string;
  name: string;
  milliOdds: number;
  status: string;
}
export interface UiMarket {
  id: string;
  type: string;
  name: string;
  line: number | null;
  status: string;
  selections: UiSelection[];
}
export interface UiFixture {
  id: string;
  code: number; // short public match ID
  sportKey: string;
  competition: string; // official league name when known, else the feed's name
  competitionId: string;
  competitionBadge: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  venue: string | null;
  startsAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  bettable: boolean; // same rule the bet engine enforces
  markets: UiMarket[];
}

// Sportsbook convention (1 X 2, 1X 12 X2, Over/Under, Yes/No) rather than alphabetical codes.
const SELECTION_ORDER = ["1", "X", "2", "1X", "12", "X2", "OVER", "UNDER", "BTTS_YES", "BTTS_NO"];
const rank = (code: string) => {
  const i = SELECTION_ORDER.indexOf(code);
  return i === -1 ? SELECTION_ORDER.length : i;
};

// Main market of each kind before its extra lines, so grouped views keep the main line on duplicates.
const MARKET_ORDER = [
  "MATCH_RESULT",
  "MONEYLINE",
  "DOUBLE_CHANCE",
  "DRAW_NO_BET",
  "OVER_UNDER",
  "ALT_TOTAL",
  "HOME_TOTAL",
  "AWAY_TOTAL",
  "BTTS",
  "ODD_EVEN",
  "HANDICAP",
  "ALT_HANDICAP",
  "CORRECT_SCORE",
];

// Matches still unsettled this long after kickoff are almost certainly over; don't list them.
const STARTED_WINDOW_MS = 3 * 60 * 60 * 1000;

const fixtureInclude = { competition: true, markets: { include: { selections: true } } } as const;
type FixtureRow = NonNullable<Awaited<ReturnType<typeof prisma.fixture.findFirst<{ include: typeof fixtureInclude }>>>>;

function shapeFixture(f: FixtureRow, now: Date): UiFixture {
  return {
    id: f.id,
    code: f.code,
    sportKey: f.sportKey,
    competition: f.competition.displayName ?? f.competition.name,
    competitionId: f.competitionId,
    competitionBadge: f.competition.badgeUrl,
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    homeTeamLogo: f.homeTeamLogo,
    awayTeamLogo: f.awayTeamLogo,
    venue: f.venue,
    startsAt: f.startsAt.toISOString(),
    status: f.status,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    bettable: isBettable(f, now),
    markets: f.markets
      // A line that moved leaves its old market SUSPENDED; hide it once another market of that type exists.
      .filter((m) => m.status !== "SUSPENDED" || !f.markets.some((o) => o.type === m.type && o.status !== "SUSPENDED"))
      .sort((a, b) => MARKET_ORDER.indexOf(a.type) - MARKET_ORDER.indexOf(b.type))
      .map((m) => ({
      id: m.id,
      type: m.type,
      name: m.name,
      line: m.line === null ? null : Number(m.line),
      status: m.status,
      selections: m.selections
        .filter((s) => s.status !== "SUSPENDED") // dropped by the feed: not offered
        .map((s) => ({ id: s.id, code: s.code, name: s.name, milliOdds: s.milliOdds, status: s.status }))
        .sort((a, b) => rank(a.code) - rank(b.code)),
    })),
  };
}

export async function listSports() {
  return prisma.sport.findMany({ where: { active: true }, orderBy: { position: "asc" } });
}

// Display order for competitions (by the leagues' official names); unlisted ones follow.
const COMPETITION_ORDER = [
  "English Premier League",
  "UEFA Champions League",
  "Spanish La Liga",
  "Italian Serie A",
  "German Bundesliga",
  "French Ligue 1",
  "NBA",
];
export const competitionRank = (name: string) => {
  const i = COMPETITION_ORDER.indexOf(name);
  return i === -1 ? COMPETITION_ORDER.length : i;
};

const openWindow = (now: Date) => ({ status: { in: ["SCHEDULED", "LIVE"] as ("SCHEDULED" | "LIVE")[] }, startsAt: { gte: new Date(now.getTime() - STARTED_WINDOW_MS) } });

export interface ListOpts {
  sportKey?: string;
  competitionId?: string;
  q?: string; // team or competition name
  live?: boolean; // kicked off and not finished
  withinHours?: number; // kick-off no later than this many hours from now (start-time filter)
  take?: number;
}

/** Start-time filter values offered in the UI; anything else from a URL is ignored. */
export const START_FILTERS = [1, 3, 6, 24] as const;
export const parseStartFilter = (v: string | undefined): number | undefined => {
  const n = Number(v);
  return (START_FILTERS as readonly number[]).includes(n) ? n : undefined;
};

/** Open fixtures from recent kick-offs onward, filtered by sport, competition or a name search. */
export async function listFixtures(opts: ListOpts = {}): Promise<UiFixture[]> {
  const now = new Date();
  const q = opts.q?.trim().slice(0, 60);
  const base = openWindow(now);
  const fixtures = await prisma.fixture.findMany({
    where: {
      ...base,
      ...(opts.live ? { startsAt: { gte: base.startsAt.gte, lte: now } } : {}),
      ...(opts.withinHours ? { startsAt: { gte: base.startsAt.gte, lte: new Date(now.getTime() + opts.withinHours * 3_600_000) } } : {}),
      sportKey: opts.sportKey,
      competitionId: opts.competitionId,
      ...(q
        ? {
            OR: [
              { homeTeam: { contains: q, mode: "insensitive" as const } },
              { awayTeam: { contains: q, mode: "insensitive" as const } },
              { competition: { name: { contains: q, mode: "insensitive" as const } } },
              { competition: { displayName: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { startsAt: "asc" },
    take: opts.take ?? 150,
    include: fixtureInclude,
  });
  return fixtures.map((f) => shapeFixture(f, now));
}

export interface UiCompetition {
  id: string;
  sportKey: string;
  name: string;
  badgeUrl: string | null;
  count: number;
}

/** Competitions that currently have open fixtures, in display order, for navigation. */
export interface HotFixture {
  id: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  picks: number; // selections placed on this fixture inside the window
}

/**
 * The fixtures punters have backed most in the last hour, ranked by how many selections were
 * placed on them. Real counts only: a quiet hour returns fewer rows, or none.
 */
export async function hotFixtures(windowMinutes = 60, take = 10): Promise<HotFixture[]> {
  const now = new Date();
  const since = new Date(now.getTime() - windowMinutes * 60_000);
  const grouped = await prisma.betSelection.groupBy({
    by: ["fixtureId"],
    where: { bet: { placedAt: { gte: since } }, fixture: openWindow(now) },
    _count: { _all: true },
    orderBy: { _count: { fixtureId: "desc" } },
    take,
  });
  if (grouped.length === 0) return [];
  const rows = await prisma.fixture.findMany({
    where: { id: { in: grouped.map((g) => g.fixtureId) } },
    select: { id: true, homeTeam: true, awayTeam: true, startsAt: true, competition: { select: { name: true, displayName: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return grouped.flatMap((g) => {
    const f = byId.get(g.fixtureId);
    if (!f) return [];
    return [
      {
        id: f.id,
        competition: f.competition.displayName ?? f.competition.name,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        startsAt: f.startsAt.toISOString(),
        picks: g._count._all,
      },
    ];
  });
}

export async function listCompetitions(): Promise<UiCompetition[]> {
  const now = new Date();
  const comps = await prisma.competition.findMany({
    include: { _count: { select: { fixtures: { where: openWindow(now) } } } },
  });
  return comps
    .filter((c) => c._count.fixtures > 0)
    .map((c) => ({ id: c.id, sportKey: c.sportKey, name: c.displayName ?? c.name, badgeUrl: c.badgeUrl, count: c._count.fixtures }))
    .sort((a, b) => competitionRank(a.name) - competitionRank(b.name) || b.count - a.count);
}

/** Settled matches with their final scores, most recent first. */
export async function listResults(opts: { sportKey?: string; days?: number } = {}): Promise<UiFixture[]> {
  const now = new Date();
  const fixtures = await prisma.fixture.findMany({
    where: {
      status: "FINISHED",
      sportKey: opts.sportKey,
      homeScore: { not: null },
      awayScore: { not: null },
      startsAt: { gte: new Date(now.getTime() - (opts.days ?? 3) * 86_400_000) },
    },
    orderBy: { startsAt: "desc" },
    take: 200,
    include: fixtureInclude,
  });
  return fixtures.map((f) => shapeFixture(f, now));
}

export async function getFixture(id: string): Promise<UiFixture | null> {
  const f = await prisma.fixture.findUnique({ where: { id }, include: fixtureInclude });
  return f ? shapeFixture(f, new Date()) : null;
}

/**
 * A cheap fingerprint of everything a match page shows (scores, statuses, prices). Pages poll it
 * and only re-render when it changes, so players see a sync within seconds at no feed cost.
 */
export async function dataVersion(): Promise<string> {
  const [f, m, s] = await Promise.all([
    prisma.fixture.aggregate({ _max: { updatedAt: true } }),
    prisma.market.aggregate({ _max: { updatedAt: true } }),
    prisma.selection.aggregate({ _max: { updatedAt: true } }),
  ]);
  return [f._max.updatedAt, m._max.updatedAt, s._max.updatedAt].map((d) => d?.getTime() ?? 0).join("-");
}
