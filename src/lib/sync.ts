/**
 * Pull fixtures/odds from the configured odds provider into the database, and settle
 * fixtures the provider reports as finished. Upserts are keyed by providerRef so repeated
 * syncs move odds without duplicating rows.
 *
 * Freshness rule: a sync source "owns" some market types (OddsProvider.bulkMarketTypes /
 * eventMarketTypes). After each refresh, any OPEN market of an owned type that wasn't
 * refreshed — a line that moved (2.5 -> 3.0), or a market the bookmakers stopped quoting —
 * is SUSPENDED, so a stale price can never be bet on. A market that comes back reopens.
 *
 * In play: only the match result stays open (IN_PLAY_MARKET_TYPES), a score change suspends all of
 * a match's open markets (updateLiveScores), and only odds fetched after that change reopen them.
 * Fixture.oddsAt records the fetch, for LIVE_BETTING_LEAGUES only, so stale live prices and other
 * leagues can't be bet on in play (isBettable).
 */
import type { MarketType } from "@prisma/client";
import { prisma } from "./db";
import { oddsProvider } from "./providers/odds";
import type { ProviderMarket } from "./providers/odds/types";
import { SettlementError, settleFixture } from "./settlement";
import { applyCachedBadges } from "./assets";
import { competitionRank } from "./queries";
import { runAutoCashouts } from "./cashout";
import { IN_PLAY_MARKET_TYPES, liveBettingLeagues } from "./markets";

const SPORTS = ["football", "basketball"];

/** Write a source's markets for one fixture and suspend that source's markets it no longer quotes. */
export async function applyMarkets(fixtureId: string, markets: ProviderMarket[], owned: readonly MarketType[]): Promise<void> {
  const refreshed: string[] = [];
  for (const m of markets) {
    // Prisma can't use a null component in a compound unique selector, so match by hand.
    const existing = await prisma.market.findFirst({ where: { fixtureId, type: m.type, line: m.line ?? null } });
    if (existing?.status === "SETTLED") continue;
    const market = existing
      ? await prisma.market.update({ where: { id: existing.id }, data: { name: m.name, status: "OPEN" } }) // reopen if it was suspended
      : await prisma.market.create({ data: { fixtureId, type: m.type, name: m.name, line: m.line ?? null, status: "OPEN" } });
    refreshed.push(market.id);
    for (const s of m.selections) {
      await prisma.selection.upsert({
        where: { marketId_code: { marketId: market.id, code: s.code } },
        create: { marketId: market.id, code: s.code, name: s.name, milliOdds: s.milliOdds, status: "OPEN" },
        // odds drift between syncs; a pick the feed quotes again reopens (graded picks are never in an OPEN market)
        update: { milliOdds: s.milliOdds, name: s.name, status: "OPEN" },
      });
    }
    // A pick the feed no longer quotes (e.g. a correct score it dropped) must not stay bettable at an old price.
    await prisma.selection.updateMany({
      where: { marketId: market.id, status: "OPEN", code: { notIn: m.selections.map((s) => s.code) } },
      data: { status: "SUSPENDED" },
    });
  }
  if (owned.length)
    await prisma.market.updateMany({
      where: { fixtureId, type: { in: [...owned] }, status: "OPEN", id: { notIn: refreshed } },
      data: { status: "SUSPENDED" },
    });
}

/**
 * `leagues` limits the fetch to those provider leagues; `inPlay` is the in-play refresh: match result
 * only, so it leaves the other markets of upcoming matches in those leagues alone.
 */
export async function syncFixtures({ leagues, inPlay = false }: { leagues?: string[]; inPlay?: boolean } = {}): Promise<{ fixtures: number; provider: string; sandbox: boolean }> {
  const provider = oddsProvider();
  const fetchedAt = new Date(); // before the fetch: prices are at least this old
  const fixtures = await provider.fetchFixtures(SPORTS, { leagues, mainOnly: inPlay });
  const owned = inPlay ? provider.bulkMarketTypes.filter((t) => IN_PLAY_MARKET_TYPES.includes(t)) : provider.bulkMarketTypes;
  const live = liveBettingLeagues();

  // Ensure sports exist.
  await prisma.sport.upsert({ where: { key: "football" }, create: { key: "football", name: "Football", position: 1 }, update: {} });
  await prisma.sport.upsert({ where: { key: "basketball" }, create: { key: "basketball", name: "Basketball", position: 2 }, update: {} });

  const now = new Date();
  for (const f of fixtures) {
    const league = f.providerLeague ? { providerRef: f.providerLeague } : {};
    const competition = await prisma.competition.upsert({
      where: { sportKey_name: { sportKey: f.sportKey, name: f.competition } },
      create: { sportKey: f.sportKey, name: f.competition, country: f.country, ...league },
      update: league,
    });

    // Never reopen a finished/cancelled fixture: check BEFORE writing, since the update sets status.
    const existing = await prisma.fixture.findUnique({ where: { providerRef: f.providerRef }, select: { status: true } });
    if (existing && (existing.status === "FINISHED" || existing.status === "CANCELLED")) continue;

    const startsAt = new Date(f.startsAt);
    const status = startsAt <= now ? "LIVE" : "SCHEDULED";
    // Only overwrite metadata the provider actually sent, so enriched badges aren't nulled.
    const meta = Object.fromEntries(
      Object.entries({ homeTeamLogo: f.homeTeamLogo, awayTeamLogo: f.awayTeamLogo, venue: f.venue, season: f.season }).filter(([, v]) => v != null),
    );
    const fixture = await prisma.fixture.upsert({
      where: { providerRef: f.providerRef },
      create: {
        sportKey: f.sportKey, competitionId: competition.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam,
        startsAt, status, providerRef: f.providerRef, lastSyncedAt: now, ...meta,
      },
      update: { startsAt, lastSyncedAt: now, status, ...meta },
    });
    if (status === "LIVE") {
      await applyMarkets(fixture.id, f.markets.filter((m) => IN_PLAY_MARKET_TYPES.includes(m.type)), owned);
      await closeInPlayExtras(fixture.id);
    } else await applyMarkets(fixture.id, f.markets, owned);
    // Prices fetched before the latest goal must not stay open: the score change wins.
    const fresh = await prisma.fixture.updateMany({
      where: { id: fixture.id, OR: [{ scoreChangedAt: null }, { scoreChangedAt: { lt: fetchedAt } }] },
      data: { oddsAt: f.providerLeague && live.includes(f.providerLeague) ? fetchedAt : null },
    });
    if (!fresh.count) await prisma.market.updateMany({ where: { fixtureId: fixture.id, status: "OPEN" }, data: { status: "SUSPENDED" } });
  }
  await applyCachedBadges(); // DB-only: new fixtures pick up badges already resolved
  await runAutoCashouts(); // new prices may reach players' auto cash out targets
  return { fixtures: fixtures.length, provider: provider.name, sandbox: provider.isSandbox };
}

/** In play only the match result is offered: every other open market on the match closes. */
const closeInPlayExtras = (fixtureId: string) =>
  prisma.market.updateMany({ where: { fixtureId, status: "OPEN", type: { notIn: IN_PLAY_MARKET_TYPES } }, data: { status: "SUSPENDED" } });

/**
 * Per-match markets (all over/under and handicap lines, team totals, correct score, odd/even,
 * GG/NG, double chance, draw no bet) for the top `limit` upcoming football fixtures. On a
 * metered feed each match costs up to one credit per market returned, so coverage is capped,
 * and the whole step pauses below ODDS_EXTRA_RESERVE credits so the main odds sync never starves.
 * Matches not refreshed — outside the top set, or paused — have these markets suspended rather
 * than left at old prices.
 */
export async function syncEventMarkets(limit = Number(process.env.ODDS_EXTRA_FIXTURES ?? 2)): Promise<{ fixtures: number; markets: number; skipped?: string }> {
  const provider = oddsProvider();
  const owned = provider.eventMarketTypes ?? [];
  if (!provider.fetchEventMarkets || !owned.length) return { fixtures: 0, markets: 0 };

  const reserve = Number(process.env.ODDS_EXTRA_RESERVE ?? 150);
  const left = provider.creditsRemaining;
  if (left != null && left < reserve) {
    await prisma.market.updateMany({ where: { type: { in: [...owned] }, status: "OPEN", fixture: { providerRef: { not: null } } }, data: { status: "SUSPENDED" } });
    return { fixtures: 0, markets: 0, skipped: `credit reserve: ${left} left` };
  }

  const upcoming = await prisma.fixture.findMany({
    where: { sportKey: "football", status: "SCHEDULED", startsAt: { gt: new Date() }, competition: { providerRef: { not: null } } },
    include: { competition: true },
  });
  const top = upcoming
    .sort(
      (a, b) =>
        competitionRank(a.competition.displayName ?? a.competition.name) - competitionRank(b.competition.displayName ?? b.competition.name) ||
        a.startsAt.getTime() - b.startsAt.getTime(),
    )
    .slice(0, Math.max(0, limit));

  const fetched = top.length
    ? await provider.fetchEventMarkets(
        top.map((f) => ({ providerRef: f.providerRef!, league: f.competition.providerRef!, homeTeam: f.homeTeam, awayTeam: f.awayTeam })),
      )
    : new Map<string, ProviderMarket[]>();

  let markets = 0;
  for (const f of top) {
    const ms = fetched.get(f.providerRef!) ?? []; // nothing fetched -> its old extras get suspended
    markets += ms.length;
    await applyMarkets(f.id, ms, owned);
  }
  // Fixtures no longer in the refreshed set: their per-match prices would only get older.
  await prisma.market.updateMany({
    // Feed fixtures only: manually created games (no providerRef) keep their admin-set markets.
    where: { type: { in: [...owned] }, status: "OPEN", fixtureId: { notIn: top.map((f) => f.id) }, fixture: { providerRef: { not: null } } },
    data: { status: "SUSPENDED" },
  });
  await runAutoCashouts();
  return { fixtures: top.length, markets };
}

// A fixture can't have a result until well after kick-off; checking earlier only spends credits.
const RESULT_AFTER_MS = 105 * 60 * 1000;

// Matches that kicked off within this window and aren't settled are treated as in play.
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Refresh scores of matches in play. DB-only (free) when nothing is live; otherwise one scores
 * call per league that has a live match. On a metered feed it stops while credits are at or
 * below LIVE_SCORES_RESERVE, so live scores can never starve the odds sync. A match the feed
 * reports finished is settled straight away. A finished match drops out of the in-play feed, so
 * one that has gone missing after RESULT_AFTER_MS is looked up in the results feed (2 credits per
 * league) instead of sitting on "live" until the next full settle run.
 */
/**
 * Flip manual/generated games to LIVE once they kick off, so they behave like feed games in play
 * (the feed does this for its own matches). Scores stay as the admin sets them. Cheap: one update.
 */
export async function goLiveManualFixtures(): Promise<{ live: number }> {
  const r = await prisma.fixture.updateMany({
    where: { providerRef: null, status: "SCHEDULED", startsAt: { lte: new Date() } },
    data: { status: "LIVE" },
  });
  return { live: r.count };
}

/** Feed matches that kicked off within LIVE_WINDOW_MS and aren't settled. */
const inPlay = (now: number) =>
  prisma.fixture.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      providerRef: { not: null },
      startsAt: { lte: new Date(now), gt: new Date(now - LIVE_WINDOW_MS) },
    },
    select: { id: true, providerRef: true, startsAt: true, homeScore: true, awayScore: true, competition: { select: { providerRef: true } } },
  });
const leaguesOf = (fs: { competition: { providerRef: string | null } }[]) =>
  [...new Set(fs.map((f) => f.competition.providerRef).filter((l): l is string => !!l))];

/**
 * In-play odds: the match result only, for LIVE_BETTING_LEAGUES with a match in play, run every
 * LIVE_ODDS_INTERVAL_MS so live prices stay within LIVE_ODDS_MAX_AGE_MS. Nothing while LIVE_BETTING
 * is off. Costs 1 credit per league per run (h2h, one region). Pauses at LIVE_ODDS_RESERVE credits,
 * never below LIVE_SCORES_RESERVE (live odds without goal detection would be unsafe), so live odds
 * stop first, then live scores, and the pre-match sync keeps running; live betting then closes by
 * itself as the odds age.
 */
export async function syncLiveOdds(): Promise<{ live: number; fixtures?: number; skipped?: string }> {
  const allowed = liveBettingLeagues();
  const leagues = leaguesOf(await inPlay(Date.now())).filter((l) => allowed.includes(l));
  if (!leagues.length) return { live: 0 };
  const reserve = Math.max(Number(process.env.LIVE_ODDS_RESERVE ?? 300), Number(process.env.LIVE_SCORES_RESERVE ?? 150));
  const left = oddsProvider().creditsRemaining;
  if (left != null && left <= reserve) return { live: leagues.length, skipped: `credit reserve: ${left} left` };
  return { live: leagues.length, fixtures: (await syncFixtures({ leagues, inPlay: true })).fixtures };
}

/** `only` picks which provider leagues this run polls (the worker polls live-betting leagues faster); default all. */
export async function updateLiveScores(only: (league: string) => boolean = () => true): Promise<{ live: number; updated: number; settled: number; skipped?: string }> {
  const provider = oddsProvider();
  if (!provider.fetchLiveScores) return { live: 0, updated: 0, settled: 0 };
  const now = Date.now();
  const live = (await inPlay(now)).filter((f) => f.competition.providerRef && only(f.competition.providerRef));
  const leagues = leaguesOf(live);
  if (!leagues.length) return { live: live.length, updated: 0, settled: 0 };

  const reserve = Number(process.env.LIVE_SCORES_RESERVE ?? 150);
  const left = provider.creditsRemaining;
  if (left != null && left <= reserve) return { live: live.length, updated: 0, settled: 0, skipped: `credit reserve: ${left} left` };

  const byRef = new Map((await provider.fetchLiveScores(leagues)).map((r) => [r.providerRef, r]));
  let updated = 0;
  let settled = 0;
  for (const f of live) {
    const r = byRef.get(f.providerRef!);
    if (!r) continue; // not started on the feed yet
    if (r.finished) {
      if (await settleIfOpen(f.id, r.homeScore, r.awayScore)) settled++;
    } else {
      // A goal makes every price on the match stale: suspend them all until odds fetched after it
      // arrive. Otherwise only the match result stays open in play.
      const goal = (f.homeScore ?? 0) !== r.homeScore || (f.awayScore ?? 0) !== r.awayScore;
      await prisma.$transaction([
        goal ? prisma.market.updateMany({ where: { fixtureId: f.id, status: "OPEN" }, data: { status: "SUSPENDED" } }) : closeInPlayExtras(f.id),
        // Guarded on status so a match an admin settled meanwhile is never flipped back to LIVE.
        prisma.fixture.updateMany({
          where: { id: f.id, status: { in: ["SCHEDULED", "LIVE"] } },
          data: { homeScore: r.homeScore, awayScore: r.awayScore, status: "LIVE", ...(goal && { scoreChangedAt: new Date(), oddsAt: null }) },
        }),
      ]);
      updated++;
    }
  }

  const gone = live.filter((f) => !byRef.has(f.providerRef!) && f.startsAt.getTime() < now - RESULT_AFTER_MS);
  if (gone.length) {
    for (const r of await provider.fetchResults(gone.map((f) => f.providerRef!), leaguesOf(gone))) {
      const f = gone.find((g) => g.providerRef === r.providerRef);
      if (f && r.finished && (await settleIfOpen(f.id, r.homeScore, r.awayScore))) settled++;
    }
  }
  return { live: live.length, updated, settled };
}

/** Settle from the feed unless the match already has a final result (e.g. an admin settled it). */
async function settleIfOpen(fixtureId: string, home: number, away: number): Promise<boolean> {
  try {
    await settleFixture(fixtureId, home, away);
    return true;
  } catch (e) {
    if (e instanceof SettlementError) return false;
    throw e;
  }
}

/** Match-id prefixes of the feeds that label their matches: TheSportsDB, the sandbox. The Odds API's ids carry none. */
const OTHER_FEED_PREFIXES = ["sdb-", "sbx-"];

/**
 * Retire matches a previous feed left behind. After switching to The Odds API, matches imported
 * from TheSportsDB or the sandbox are never updated or settled again: they'd stay open forever,
 * list their league a second time beside the new feed's, and trip the "waiting for results"
 * alert. Only matches nobody has bet on are closed (CANCELLED, as for a called-off game); one
 * with bets is left for an admin to settle or void. Checks the feed actually in use, not the
 * setting: with the key missing it falls back to TheSportsDB, and then this does nothing.
 */
export async function retireOrphanedFeedFixtures(): Promise<{ retired: number; kept: number }> {
  if (oddsProvider().name !== "theoddsapi") return { retired: 0, kept: 0 };
  const orphaned = {
    status: { in: ["SCHEDULED", "LIVE"] as ("SCHEDULED" | "LIVE")[] },
    OR: OTHER_FEED_PREFIXES.map((p) => ({ providerRef: { startsWith: p } })),
  };
  const { count: retired } = await prisma.fixture.updateMany({ where: { ...orphaned, betSelections: { none: {} } }, data: { status: "CANCELLED" } });
  const kept = await prisma.fixture.count({ where: orphaned });
  return { retired, kept };
}

/** Settle any fixture the provider reports finished that we haven't settled yet. */
export async function autoSettleFinished(): Promise<{ settled: number }> {
  const provider = oddsProvider();
  const open = await prisma.fixture.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      providerRef: { not: null },
      startsAt: { lt: new Date(Date.now() - RESULT_AFTER_MS) },
    },
    select: { id: true, providerRef: true, competition: { select: { providerRef: true } } },
  });
  if (!open.length) return { settled: 0 };
  // Only query leagues that have a candidate (each scores lookup costs credits on metered feeds).
  const leagues = [...new Set(open.map((f) => f.competition.providerRef).filter((l): l is string => !!l))];
  const results = await provider.fetchResults(
    open.map((f) => f.providerRef!),
    leagues.length ? leagues : undefined,
  );
  const byRef = new Map(results.map((r) => [r.providerRef, r]));
  let settled = 0;
  for (const f of open) {
    const r = byRef.get(f.providerRef!);
    if (r && r.finished) {
      if (await settleIfOpen(f.id, r.homeScore, r.awayScore)) settled++;
    }
  }
  return { settled };
}
