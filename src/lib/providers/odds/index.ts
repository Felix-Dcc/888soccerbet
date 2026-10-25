import type { OddsProvider } from "./types";
import { SandboxOddsProvider } from "./sandbox";
import { TheOddsApiProvider } from "./theOddsApi";
import { TheSportsDbProvider } from "./thesportsdb";

let cached: OddsProvider | null = null;

/**
 * Data-source selection. Production NEVER silently falls back to invented odds.
 *   DATA_PROVIDER=thesportsdb (default) -> real fixtures/teams/logos/scores, NO odds
 *   DATA_PROVIDER=theoddsapi (+ ODDS_API_KEY) -> real fixtures AND real bookmaker odds
 *   DATA_PROVIDER=sandbox -> simulated demo odds, allowed ONLY outside production
 * (ODDS_PROVIDER is still read for backward compatibility.)
 */
export function oddsProvider(): OddsProvider {
  if (cached) return cached;
  const which = process.env.DATA_PROVIDER ?? process.env.ODDS_PROVIDER ?? "thesportsdb";
  const isProd = process.env.NODE_ENV === "production";

  if (which === "theoddsapi") {
    if (process.env.ODDS_API_KEY) {
      cached = new TheOddsApiProvider(process.env.ODDS_API_KEY);
    } else {
      console.warn("[providers] DATA_PROVIDER=theoddsapi but ODDS_API_KEY is missing; using real fixtures (TheSportsDB) with no odds.");
      cached = new TheSportsDbProvider();
    }
  } else if (which === "sandbox") {
    if (isProd) {
      console.warn("[providers] sandbox odds are not permitted in production; using real fixtures (TheSportsDB) with no odds.");
      cached = new TheSportsDbProvider();
    } else {
      cached = new SandboxOddsProvider();
    }
  } else {
    cached = new TheSportsDbProvider();
  }
  return cached;
}

export type { OddsProvider } from "./types";
