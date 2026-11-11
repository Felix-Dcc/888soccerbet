/**
 * Background worker: keeps odds fresh and settles finished fixtures.
 * Run alongside the app:  npm run worker
 * (Jobs could also be driven by POSTing /api/cron from an external scheduler.)
 */
import { syncFixtures, syncEventMarkets, autoSettleFinished, settleRecentlyFinished, goLiveManualFixtures, updateLiveScores, syncLiveOdds, retireOrphanedFeedFixtures, dueLeagues } from "./lib/sync";
import { ODDS_LEAGUES } from "./lib/providers/odds/theOddsApi";
import { enrichCompetitions, enrichTeams } from "./lib/assets";
import { advanceScriptedMatches } from "./lib/scriptedMatches";
import { oddsProvider } from "./lib/providers/odds";
import { liveBettingLeagues } from "./lib/markets";

// Budget on The Odds API free tier (500 credits/month), measured: bulk odds = 1 credit per market
// per league (6 leagues × h2h/spreads/totals = 18 per sync); per-match markets = 1 per market the
// feed returns, up to ~8 per match with every market on (ODDS_EXTRA_FIXTURES=2 -> ~16); a settle =
// 2 per league with a finished-but-unsettled match (<= 12). 48h sync ~= 34 x 15 = ~510/mo, so on
// the free tier the per-match markets pause automatically once credits fall below
// ODDS_EXTRA_RESERVE (default 150) and the main odds keep syncing. A paid plan removes the squeeze.
// On The Odds API the fixed SYNC_MS timer is replaced by per-league scheduling (oddsTick below).
const H = 60 * 60 * 1000;
const SYNC_MS = Number(process.env.SYNC_INTERVAL_MS ?? 48 * H);
const SETTLE_MS = Number(process.env.SETTLE_INTERVAL_MS ?? 96 * H);
// Results soon after full time: free unless a match is at one of its check ages (lib/resultChecks),
// then 2 credits per league. Runs even while live scores sit at their credit reserve, so bets settle
// within hours, not at the next full settle run (whose 3-day results window it could miss).
const RESULT_CHECK_MS = Number(process.env.RESULT_CHECK_INTERVAL_MS ?? 30 * 60 * 1000);
// Live scores: free (DB-only) when nothing is in play; otherwise 1 credit per live league per run.
// Pauses at LIVE_SCORES_RESERVE credits left so the odds sync keeps running all month. Leagues that
// take live bets are polled every minute (their scores drive goal suspensions); the rest every 5
// minutes, which is enough to settle and pay out soon after the final whistle.
const LIVE_MS = Number(process.env.LIVE_SCORES_INTERVAL_MS ?? 5 * 60 * 1000);
const LIVE_BETTING_SCORES_MS = Number(process.env.LIVE_BETTING_SCORES_INTERVAL_MS ?? 60_000);
// In-play odds for LIVE_BETTING_LEAGUES with a match in play: match result only, 1 credit per league.
const LIVE_ODDS_MS = Number(process.env.LIVE_ODDS_INTERVAL_MS ?? 60_000);
const isLiveBettingLeague = (league: string) => liveBettingLeagues().includes(league);
// Badges/league artwork come from TheSportsDB (not The Odds API), so this costs no odds credits.
// Each run only spends requests on still-unresolved teams; once all are cached it is a DB no-op.
const ENRICH_MS = Number(process.env.ENRICH_INTERVAL_MS ?? 10 * 60 * 1000);

// Per-match markets need the fixtures (and their league keys) the bulk sync just wrote.
const sync = async () => ({ fixtures: await syncFixtures(), extras: await syncEventMarkets() });

// The Odds API: instead of every league on one timer, each league refreshes on a cadence set by its
// next kickoff (lib/oddsSchedule: 1h within 3h of kickoff ... daily with nothing scheduled). The
// due-check is DB-only; credits are spent only on leagues that are due.
const ODDS_TICK_MS = 15 * 60 * 1000;
const EXTRAS_MS = Number(process.env.ODDS_EXTRA_INTERVAL_MS ?? 3 * H);
const lastOdds = new Map<string, number>();
async function oddsTick() {
  try {
    const now = Date.now();
    const due = await dueLeagues(ODDS_LEAGUES, lastOdds, now);
    if (!due.length) return;
    for (const l of due) lastOdds.set(l, now);
    console.log("[worker] odds", { leagues: due, ...(await syncFixtures({ leagues: due })) });
  } catch (e) {
    console.error("[worker] odds failed:", e instanceof Error ? e.message : e);
  }
}

let enriching = false;
async function enrich() {
  if (enriching) return; // a run can take several minutes at the free tier's request spacing
  enriching = true;
  try {
    // League lookups can hit the rate limit too; don't let that block team enrichment.
    const leagues = await enrichCompetitions().catch((e: Error) => `deferred: ${e.message}`);
    return { leagues, teams: await enrichTeams(40) };
  } finally {
    enriching = false;
  }
}

async function safe(label: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    console.log(`[worker] ${label}`, r);
  } catch (e) {
    console.error(`[worker] ${label} failed:`, e instanceof Error ? e.message : e);
  }
}

/** Like safe(), but only logs runs that did something (live checks run every few minutes). */
async function quiet(label: string, fn: () => Promise<{ live: number; skipped?: string }>) {
  try {
    const r = await fn();
    if (r.live || r.skipped) console.log(`[worker] ${label}`, r);
  } catch (e) {
    console.error(`[worker] ${label} failed:`, e instanceof Error ? e.message : e);
  }
}

/** Results soon after full time: log only the runs that checked something. */
async function recent() {
  try {
    const r = await settleRecentlyFinished(RESULT_CHECK_MS);
    if (r.checked) console.log("[worker] results", r);
  } catch (e) {
    console.error("[worker] results failed:", e instanceof Error ? e.message : e);
  }
}

/** Generated matches: log only the ticks that changed something. */
async function scripted() {
  try {
    const r = await advanceScriptedMatches();
    if (r.updated || r.settled) console.log("[worker] scripted", r);
  } catch (e) {
    console.error("[worker] scripted failed:", e instanceof Error ? e.message : e);
  }
}

async function main() {
  const p = oddsProvider();
  const smart = p.name === "theoddsapi";
  console.log(
    `[worker] starting · provider=${p.name} · ${smart ? `odds by next kickoff, extras every ${EXTRAS_MS / 3_600_000}h` : `sync every ${SYNC_MS / 3_600_000}h`} · settle every ${SETTLE_MS / 3_600_000}h`,
  );
  // A feed switch always restarts the worker, so retiring the old feed's matches once here is enough.
  // It runs first so settle never asks the new feed about matches it doesn't know. No credits used.
  await safe("retire", retireOrphanedFeedFixtures);
  if (smart) {
    await oddsTick(); // nothing refreshed yet in this process: every league is due
    await safe("extras", () => syncEventMarkets());
    setInterval(() => void oddsTick(), ODDS_TICK_MS);
    setInterval(() => void safe("extras", () => syncEventMarkets()), EXTRAS_MS);
  } else {
    await safe("sync", sync);
    setInterval(() => void safe("sync", sync), SYNC_MS);
  }
  await safe("settle", autoSettleFinished);
  await safe("artwork", enrich);
  setInterval(() => void safe("settle", autoSettleFinished), SETTLE_MS);
  setInterval(() => void recent(), RESULT_CHECK_MS);
  setInterval(() => void safe("artwork", enrich), ENRICH_MS);
  setInterval(() => void quiet("live", () => updateLiveScores((l) => !isLiveBettingLeague(l))), LIVE_MS);
  setInterval(() => void quiet("golive", goLiveManualFixtures), LIVE_MS);
  if (liveBettingLeagues().length) {
    setInterval(() => void quiet("live betting scores", () => updateLiveScores(isLiveBettingLeague)), LIVE_BETTING_SCORES_MS);
    setInterval(() => void quiet("live odds", syncLiveOdds), LIVE_ODDS_MS);
  }
  // Generated matches tick every 10s so scores move in real time and their markets reopen soon after a goal.
  setInterval(() => void scripted(), 10_000);
}

void main();
