/**
 * Builds a fictional match for the admin "Generate match" button: made-up teams, competition and
 * venue that exist in no real league, with sensible randomised odds across every market the manual
 * builder supports. The result is a plain ManualFixtureInput, so it goes through the same schema and
 * createManualFixture path as a hand-entered game — nothing here trusts the browser.
 */
import type { ManualFixtureInput } from "./validation";

type Sport = "football" | "basketball";

// Clearly invented names: an adjective + a creature/figure, so no combination is a real club.
const ADJECTIVES = ["Crimson", "Azure", "Golden", "Shadow", "Iron", "Silver", "Emerald", "Thunder", "Phantom", "Royal", "Mystic", "Savage", "Northern", "Wild", "Electric", "Granite", "Scarlet", "Cobalt", "Solar", "Frost"];
const NOUNS = ["Harriers", "Wanderers", "Sentinels", "Titans", "Falcons", "Mariners", "Rovers", "Phoenix", "Gladiators", "Nomads", "Vipers", "Comets", "Wolves", "Rangers", "Spartans", "Drifters", "Hawks", "Monarchs", "Raiders", "Pioneers"];
const FOOTBALL_COMPS = ["Kingz Exhibition Cup", "Nebula Invitational", "Phantom Trophy", "Galaxy Friendly Series", "Aurora Challenge Cup"];
const BASKETBALL_COMPS = ["Kingz Hoops Showcase", "Orbit Basketball Invitational", "Skyline Exhibition League"];
const VENUES = ["Horizon Arena", "Starfall Park", "Summit Grounds", "Lumen Stadium", "Crater Dome", "Meridian Field"];

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const range = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** Decimal odds from a win probability, with the house margin baked in; clamped to a realistic band. */
const oddsFrom = (prob: number, margin = 1.08) => Math.min(26, Math.max(1.08, Math.round((margin / prob) * 100) / 100));

/** Two distinct fictional team names. */
function twoTeams(): [string, string] {
  const name = () => `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  let home = name();
  let away = name();
  while (away === home) away = name();
  return [home, away];
}

/** Three result probabilities (home, draw, away) that sum to 1, each with a sane floor. */
function footballProbs(): [number, number, number] {
  const draw = range(0.2, 0.3);
  const rest = 1 - draw;
  const home = rest * range(0.42, 0.62); // home edge
  return [home, draw, rest - home];
}

export function generateMatch(sport: Sport = Math.random() < 0.8 ? "football" : "basketball"): ManualFixtureInput {
  const [homeTeam, awayTeam] = twoTeams();
  // Kick off 1.5–4 hours out, rounded to the next 5 minutes, so it sits in the upcoming list.
  const startsAtMs = Math.ceil((Date.now() + range(1.5, 4) * 3_600_000) / 300_000) * 300_000;
  const base = { homeTeam, awayTeam, venue: pick(VENUES), startsAt: new Date(startsAtMs).toISOString() };

  if (sport === "basketball") {
    const home = range(0.4, 0.62);
    const line = Math.round(range(195, 225)) + 0.5; // points total, always a half line
    const over = range(0.47, 0.53);
    return {
      sportKey: "basketball",
      competition: pick(BASKETBALL_COMPS),
      ...base,
      result: { home: oddsFrom(home), away: oddsFrom(1 - home) },
      total: { line, over: oddsFrom(over), under: oddsFrom(1 - over) },
    };
  }

  const [home, draw, away] = footballProbs();
  const line = pick([1.5, 2.5, 3.5]);
  const over = range(0.45, 0.6);
  const yes = range(0.48, 0.62);
  return {
    sportKey: "football",
    competition: pick(FOOTBALL_COMPS),
    ...base,
    result: { home: oddsFrom(home), draw: oddsFrom(draw), away: oddsFrom(away) },
    total: { line, over: oddsFrom(over), under: oddsFrom(1 - over) },
    btts: { yes: oddsFrom(yes), no: oddsFrom(1 - yes) },
  };
}
