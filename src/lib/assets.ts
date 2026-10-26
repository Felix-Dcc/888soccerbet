/**
 * Official team badges and league artwork from TheSportsDB, cached in the database.
 *
 * Correctness over coverage: a badge is attached only when the sport matches AND the team
 * name matches exactly (accents, punctuation and FC/CF suffixes aside). The free API returns
 * one search hit, which is sometimes another sport's namesake (e.g. a netball "Nottingham
 * Forest"), so anything that doesn't verify is stored as MISSING and the UI shows initials.
 */
import { prisma } from "./db";

const KEY = process.env.THESPORTSDB_KEY || "123";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;
const SDB_SPORT: Record<string, string> = { football: "Soccer", basketball: "Basketball" };

/** Our competition name (as the odds feed spells it) -> TheSportsDB league id. */
const LEAGUE_IDS: Record<string, string> = {
  EPL: "4328",
  "English Premier League": "4328",
  "La Liga - Spain": "4335",
  "Spanish La Liga": "4335",
  "Serie A - Italy": "4332",
  "Italian Serie A": "4332",
  "Bundesliga - Germany": "4331",
  "German Bundesliga": "4331",
  "Ligue 1 - France": "4334",
  "French Ligue 1": "4334",
  "UEFA Champions League": "4480",
  NBA: "4387",
};

const MISS_RETRY_MS = 7 * 24 * 3600_000;
const LEAGUE_RECHECK_MS = 30 * 24 * 3600_000;
const SPACING_MS = 3000; // stays well under the free tier's per-minute limit (it answers 429 when exceeded)

/** The provider refused or failed: retry later. Never recorded as "team has no badge". */
export class ProviderUnavailable extends Error {}

export interface SdbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort?: string | null;
  strTeamAlternate?: string | null;
  strSport?: string | null;
  strBadge?: string | null;
  strTeamBadge?: string | null;
}

export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["fc", "cf", "afc", "sc", "ac"].includes(w))
    .join(" ");
}

/** The candidate that is unambiguously this team in this sport, or null. */
export function pickTeam(candidates: SdbTeam[], name: string, sportKey: string): SdbTeam | null {
  const want = normName(name);
  const sport = SDB_SPORT[sportKey];
  const hits = candidates.filter((t) => {
    if (!sport || t.strSport !== sport) return false;
    const names = [t.strTeam, t.strTeamShort, ...(t.strTeamAlternate ?? "").split(",")].filter(Boolean) as string[];
    return names.some((n) => normName(n) === want);
  });
  return hits.length === 1 ? hits[0]! : null;
}

/** A parsed JSON answer, or ProviderUnavailable for 429s, timeouts, network errors and text notices. */
async function sdb<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(`${BASE}/${path}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new ProviderUnavailable(`HTTP ${r.status}`);
    const text = await r.text();
    if (!text.trim().startsWith("{")) throw new ProviderUnavailable(text.slice(0, 80)); // key/limit notices come back as text
    return JSON.parse(text) as T;
  } catch (e) {
    throw e instanceof ProviderUnavailable ? e : new ProviderUnavailable(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** League badge, banner photography and official name for each mapped competition. */
export async function enrichCompetitions(): Promise<number> {
  const due = await prisma.competition.findMany({
    where: { OR: [{ assetsCheckedAt: null }, { assetsCheckedAt: { lt: new Date(Date.now() - LEAGUE_RECHECK_MS) } }] },
  });
  let updated = 0;
  for (const c of due) {
    const id = LEAGUE_IDS[c.name];
    if (!id) {
      await prisma.competition.update({ where: { id: c.id }, data: { assetsCheckedAt: new Date() } });
      continue;
    }
    // On ProviderUnavailable this throws before assetsCheckedAt is set, so the league is retried next run.
    const res = await sdb<{ leagues?: Array<Record<string, string | null>> }>(`lookupleague.php?id=${id}`);
    const l = res.leagues?.[0];
    const ok = l && l.strSport === SDB_SPORT[c.sportKey]; // guard against canned/mismatched responses
    await prisma.competition.update({
      where: { id: c.id },
      data: {
        assetsCheckedAt: new Date(),
        ...(ok ? { displayName: l.strLeague ?? null, badgeUrl: l.strBadge ?? null, bannerUrl: l.strFanart1 ?? l.strBanner ?? null } : {}),
      },
    });
    if (ok) updated++;
    await sleep(SPACING_MS);
  }
  return updated;
}

/** A badge we drew ourselves from the team's name, which a real one should replace. */
const noRealBadge = [{ equals: null }, { startsWith: "/api/crest/" }];

/** Copy cached badges onto fixtures that don't have a real one (new fixtures arrive without). */
export async function applyCachedBadges(): Promise<void> {
  const found = await prisma.teamAsset.findMany({ where: { status: "FOUND" } });
  for (const a of found) {
    await prisma.fixture.updateMany({ where: { sportKey: a.sportKey, homeTeam: a.name, OR: noRealBadge.map((homeTeamLogo) => ({ homeTeamLogo })) }, data: { homeTeamLogo: a.badgeUrl } });
    await prisma.fixture.updateMany({ where: { sportKey: a.sportKey, awayTeam: a.name, OR: noRealBadge.map((awayTeamLogo) => ({ awayTeamLogo })) }, data: { awayTeamLogo: a.badgeUrl } });
  }
}

/**
 * Resolve badges for up to `budget` teams that have none yet. Safe to call repeatedly: it
 * only spends requests on unresolved teams, and retries misses weekly.
 */
export async function enrichTeams(budget = 25): Promise<{ looked: number; found: number; remaining: number; stopped?: string }> {
  const fixtures = await prisma.fixture.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE"] } },
    select: { sportKey: true, homeTeam: true, awayTeam: true },
  });
  const teams = new Map<string, { sportKey: string; name: string }>();
  for (const f of fixtures)
    for (const name of [f.homeTeam, f.awayTeam]) teams.set(`${f.sportKey}|${name}`, { sportKey: f.sportKey, name });

  const known = await prisma.teamAsset.findMany();
  const fresh = new Set(
    known.filter((a) => a.status === "FOUND" || a.checkedAt > new Date(Date.now() - MISS_RETRY_MS)).map((a) => `${a.sportKey}|${a.name}`),
  );
  const todo = [...teams.entries()].filter(([k]) => !fresh.has(k)).map(([, v]) => v);

  let looked = 0;
  let found = 0;
  let resolved = 0;
  let stopped: string | undefined;
  for (const t of todo.slice(0, budget)) {
    let team: SdbTeam | null = null;
    // Second try with "FC" for football: the bare name sometimes hits another sport first.
    const queries = t.sportKey === "football" ? [t.name, `${t.name} FC`] : [t.name];
    try {
      for (const q of queries) {
        const res = await sdb<{ teams?: SdbTeam[] | null }>(`searchteams.php?t=${encodeURIComponent(q)}`);
        looked++;
        await sleep(SPACING_MS);
        team = pickTeam(res.teams ?? [], t.name, t.sportKey);
        if (team) break;
      }
    } catch (e) {
      // Rate-limited or down: stop the batch and record nothing, so this team is retried next run.
      stopped = e instanceof Error ? e.message : String(e);
      break;
    }
    resolved++;
    const badgeUrl = team?.strBadge || team?.strTeamBadge || null;
    await prisma.teamAsset.upsert({
      where: { sportKey_name: { sportKey: t.sportKey, name: t.name } },
      create: { sportKey: t.sportKey, name: t.name, status: badgeUrl ? "FOUND" : "MISSING", badgeUrl, sourceRef: team?.idTeam },
      update: { status: badgeUrl ? "FOUND" : "MISSING", badgeUrl, sourceRef: team?.idTeam ?? null, checkedAt: new Date() },
    });
    if (badgeUrl) found++;
  }
  await applyCachedBadges();
  return { looked, found, remaining: todo.length - resolved, ...(stopped ? { stopped } : {}) };
}
