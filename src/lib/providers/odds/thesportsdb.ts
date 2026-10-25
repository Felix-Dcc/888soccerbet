/**
 * TheSportsDB adapter — REAL fixtures, teams, badges (logos), venues and scores.
 *
 * IMPORTANT: TheSportsDB is a sports *data* feed, not a sportsbook. It supplies NO
 * bookmaker odds, so this provider returns fixtures with an EMPTY markets array. Those
 * fixtures are shown as "odds not available" rather than being given invented prices.
 * To offer betting markets, configure a real odds provider (DATA_PROVIDER=theoddsapi).
 *
 * The free/test tier (key "123") returns only ~1 event per league per call; a premium
 * key returns full schedules. The adapter works identically with a premium key.
 */
import type { OddsProvider, ProviderFixture, ProviderResult } from "./types";

const KEY = process.env.THESPORTSDB_KEY || "123";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

// League id -> our sport key. (TheSportsDB league ids are stable.)
const LEAGUES: Record<string, string> = {
  "4328": "football", // English Premier League
  "4335": "football", // La Liga
  "4332": "football", // Serie A
  "4331": "football", // Bundesliga
  "4334": "football", // Ligue 1
  "4387": "basketball", // NBA
};

export interface SdbEvent {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strVenue?: string | null;
  strStatus?: string | null;
  strPostponed?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strLeague?: string | null;
  strSeason?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
}

export function kickoffIso(e: SdbEvent): string | null {
  if (e.strTimestamp) {
    // TheSportsDB timestamps are UTC without a zone suffix; make it explicit.
    const s = e.strTimestamp.includes("Z") || /[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? e.strTimestamp : e.strTimestamp + "Z";
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (e.dateEvent) {
    const d = new Date(`${e.dateEvent}T${e.strTime || "00:00:00"}Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

const FINISHED = /^(FT|AET|PEN|Match Finished|Finished)$/i;
export const isFinished = (status: string | null | undefined): boolean => FINISHED.test(status ?? "");

/** Pure mapping from a TheSportsDB event to our ProviderFixture (no odds). Exported for tests. */
export function mapEvent(e: SdbEvent, sportKey: string): ProviderFixture | null {
  const startsAt = kickoffIso(e);
  if (!startsAt || e.strPostponed === "yes") return null;
  return {
    providerRef: `sdb-${e.idEvent}`,
    sportKey,
    competition: e.strLeague || "",
    homeTeam: e.strHomeTeam,
    awayTeam: e.strAwayTeam,
    startsAt,
    homeTeamLogo: e.strHomeTeamBadge ?? null,
    awayTeamLogo: e.strAwayTeamBadge ?? null,
    venue: e.strVenue ?? null,
    season: e.strSeason ?? null,
    markets: [],
  };
}

async function getEvents(path: string): Promise<SdbEvent[]> {
  const r = await fetch(`${BASE}/${path}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`TheSportsDB ${path}: HTTP ${r.status}`);
  const text = await r.text();
  if (text.trim().startsWith("<") || text.includes("Free Sports API key"))
    throw new Error(`TheSportsDB ${path}: ${text.slice(0, 120)}`);
  const j = JSON.parse(text) as { events?: SdbEvent[] | null };
  return j.events ?? [];
}

export class TheSportsDbProvider implements OddsProvider {
  readonly name = "thesportsdb";
  readonly isSandbox = false;
  readonly bulkMarketTypes = [] as const; // data feed only: supplies no markets

  async fetchFixtures(sports: string[]): Promise<ProviderFixture[]> {
    const out: ProviderFixture[] = [];
    for (const [leagueId, sportKey] of Object.entries(LEAGUES)) {
      if (!sports.includes(sportKey)) continue;
      let events: SdbEvent[];
      try {
        events = await getEvents(`eventsnextleague.php?id=${leagueId}`);
      } catch (e) {
        console.warn(`[thesportsdb] next ${leagueId}: ${e instanceof Error ? e.message : e}`);
        continue; // one league failing must not sink the rest
      }
      for (const e of events) {
        const fx = mapEvent(e, sportKey); // null when unschedulable/postponed
        if (fx) out.push(fx);
      }
    }
    return out;
  }

  async fetchResults(providerRefs: string[]): Promise<ProviderResult[]> {
    const want = new Set(providerRefs);
    const out: ProviderResult[] = [];
    for (const leagueId of Object.keys(LEAGUES)) {
      let events: SdbEvent[];
      try {
        events = await getEvents(`eventspastleague.php?id=${leagueId}`);
      } catch (e) {
        console.warn(`[thesportsdb] past ${leagueId}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      for (const e of events) {
        const ref = `sdb-${e.idEvent}`;
        if (!want.has(ref) || e.intHomeScore == null || e.intAwayScore == null) continue;
        out.push({
          providerRef: ref,
          homeScore: Number(e.intHomeScore),
          awayScore: Number(e.intAwayScore),
          finished: isFinished(e.strStatus),
        });
      }
    }
    return out;
  }
}
