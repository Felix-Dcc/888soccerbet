/**
 * Credit-aware odds refresh for metered feeds: each league is refreshed on a cadence set by its
 * next kickoff, since prices move most in the last hours before a match and barely at all a week out.
 */
const H = 60 * 60 * 1000;

/** How old a league's odds may get, given the time until its next kickoff (null = none scheduled). */
export function leagueRefreshMs(untilKickoffMs: number | null): number {
  if (untilKickoffMs === null) return 24 * H; // off-season / gap: just look for new fixtures daily
  if (untilKickoffMs <= 3 * H) return 1 * H;
  if (untilKickoffMs <= 24 * H) return 2 * H;
  if (untilKickoffMs <= 72 * H) return 6 * H;
  return 12 * H;
}

/**
 * Leagues due a refresh. `nextKickoff` maps league -> ms until its next scheduled match; `last` maps
 * league -> when it was last refreshed. A league never refreshed is always due. `slackMs` absorbs
 * timer drift so a 1h league isn't pushed to the following tick.
 */
export function pickDueLeagues(
  leagues: readonly string[],
  nextKickoff: ReadonlyMap<string, number>,
  last: ReadonlyMap<string, number>,
  now: number,
  slackMs = 60_000,
): string[] {
  return leagues.filter((l) => {
    const at = last.get(l);
    return at === undefined || now - at >= leagueRefreshMs(nextKickoff.get(l) ?? null) - slackMs;
  });
}
