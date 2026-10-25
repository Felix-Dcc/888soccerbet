/** Odds/sports provider contract. Adapters implement this so the trading source is swappable. */
import type { MarketType } from "@prisma/client";

export interface ProviderSelection {
  code: string;
  name: string;
  milliOdds: number;
}
export interface ProviderMarket {
  type: MarketType;
  name: string;
  line?: number | null;
  selections: ProviderSelection[];
}
export interface ProviderFixture {
  providerRef: string;
  sportKey: string;
  competition: string;
  country?: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string; // ISO
  // Optional real-world metadata (populated by providers that supply it, e.g. TheSportsDB).
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  venue?: string | null;
  season?: string | null;
  // The provider's league key (e.g. "soccer_epl"); stored on Competition.providerRef.
  providerLeague?: string;
  // Providers that supply fixtures but NOT bookmaker odds return an empty markets array.
  markets: ProviderMarket[];
}

/** A fixture to fetch per-match markets for. */
export interface EventRef {
  providerRef: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
}
export interface ProviderResult {
  providerRef: string;
  homeScore: number;
  awayScore: number;
  finished: boolean;
}

export interface OddsProvider {
  readonly name: string;
  readonly isSandbox: boolean;
  /**
   * Market types fetchFixtures is responsible for. On each sync, an OPEN market of one of these
   * types that the provider no longer returns is suspended, so stale prices can't be bet on.
   */
  readonly bulkMarketTypes: readonly MarketType[];
  /** Market types fetchEventMarkets is responsible for (same suspension rule). */
  readonly eventMarketTypes?: readonly MarketType[];
  /** Pull current fixtures + markets for the given sports. */
  fetchFixtures(sports: string[]): Promise<ProviderFixture[]>;
  /** Optional per-match markets (costlier on metered feeds); keyed by providerRef. */
  fetchEventMarkets?(events: EventRef[]): Promise<Map<string, ProviderMarket[]>>;
  /** Optional in-play scores for matches under way in these leagues (finished=false while live). */
  fetchLiveScores?(leagues: string[]): Promise<ProviderResult[]>;
  /** Credits left on a metered feed, as last reported by the provider (null = unknown/unmetered). */
  readonly creditsRemaining?: number | null;
  /** Pull results for fixtures (for settlement). `leagues` narrows the lookup when known. */
  fetchResults(providerRefs: string[], leagues?: string[]): Promise<ProviderResult[]>;
}
