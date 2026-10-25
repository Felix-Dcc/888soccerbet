/**
 * Deterministic sandbox trading feed. No external calls, no real odds. Fixtures are
 * generated relative to "now" so there are always upcoming, live and finished games.
 * Results are derived from a hash of the fixture ref, so settlement is reproducible.
 */
import type { OddsProvider, ProviderFixture, ProviderResult, ProviderMarket } from "./types";

const FOOTBALL: Array<[string, string, string]> = [
  ["Premier League", "Accra Lions", "Hearts of Oak"],
  ["Premier League", "Asante Kotoko", "Medeama SC"],
  ["Premier League", "Aduana Stars", "Karela United"],
  ["LaLiga", "Real Madrid", "Sevilla"],
  ["LaLiga", "Barcelona", "Valencia"],
  ["Premier League (ENG)", "Arsenal", "Chelsea"],
  ["Premier League (ENG)", "Liverpool", "Everton"],
  ["Serie A", "Juventus", "Napoli"],
  ["Bundesliga", "Bayern Munich", "Dortmund"],
  ["Champions League", "Man City", "Inter"],
];
const BASKETBALL: Array<[string, string, string]> = [
  ["NBA", "Lakers", "Celtics"],
  ["NBA", "Warriors", "Nuggets"],
  ["NBA", "Bucks", "Heat"],
  ["EuroLeague", "Real Madrid", "Olympiacos"],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const rngFor = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const mo = (p: number) => Math.max(1010, Math.round((1 / p) * 950)); // 5% margin baked in

function footballMarkets(ref: string): ProviderMarket[] {
  const r = rngFor(hash(ref));
  const pHome = 0.3 + r() * 0.4;
  const pDraw = 0.22 + r() * 0.1;
  const pAway = Math.max(0.1, 1 - pHome - pDraw);
  const pOver = 0.4 + r() * 0.25;
  const pBtts = 0.45 + r() * 0.2;
  return [
    {
      type: "MATCH_RESULT",
      name: "Match Result",
      selections: [
        { code: "1", name: "Home", milliOdds: mo(pHome) },
        { code: "X", name: "Draw", milliOdds: mo(pDraw) },
        { code: "2", name: "Away", milliOdds: mo(pAway) },
      ],
    },
    {
      type: "DOUBLE_CHANCE",
      name: "Double Chance",
      selections: [
        { code: "1X", name: "Home or Draw", milliOdds: mo(pHome + pDraw) },
        { code: "12", name: "Home or Away", milliOdds: mo(pHome + pAway) },
        { code: "X2", name: "Draw or Away", milliOdds: mo(pDraw + pAway) },
      ],
    },
    {
      type: "OVER_UNDER",
      name: "Total Goals",
      line: 2.5,
      selections: [
        { code: "OVER", name: "Over 2.5", milliOdds: mo(pOver) },
        { code: "UNDER", name: "Under 2.5", milliOdds: mo(1 - pOver) },
      ],
    },
    {
      type: "BTTS",
      name: "Both Teams To Score",
      selections: [
        { code: "BTTS_YES", name: "Yes", milliOdds: mo(pBtts) },
        { code: "BTTS_NO", name: "No", milliOdds: mo(1 - pBtts) },
      ],
    },
  ];
}

function basketballMarkets(ref: string): ProviderMarket[] {
  const r = rngFor(hash(ref));
  const pHome = 0.35 + r() * 0.3;
  const pOver = 0.45 + r() * 0.1;
  return [
    {
      type: "MONEYLINE",
      name: "Match Winner",
      selections: [
        { code: "1", name: "Home", milliOdds: mo(pHome) },
        { code: "2", name: "Away", milliOdds: mo(1 - pHome) },
      ],
    },
    {
      type: "OVER_UNDER",
      name: "Total Points",
      line: 210.5,
      selections: [
        { code: "OVER", name: "Over 210.5", milliOdds: mo(pOver) },
        { code: "UNDER", name: "Under 210.5", milliOdds: mo(1 - pOver) },
      ],
    },
  ];
}

function buildFixtures(): ProviderFixture[] {
  const now = Date.now();
  const out: ProviderFixture[] = [];
  const push = (
    sportKey: string,
    list: Array<[string, string, string]>,
    markets: (ref: string) => ProviderMarket[],
  ) => {
    list.forEach(([comp, home, away], i) => {
      const ref = `sbx-${sportKey}-${i}`;
      // spread kickoffs: some finished (-3h), some live (-30m), many upcoming (+hours)
      const offsetH = [-3, -0.5, 1, 2, 4, 6, 24, 26, 48, 50][i % 10]!;
      out.push({
        providerRef: ref,
        sportKey,
        competition: comp,
        country: sportKey === "football" ? "INT" : "USA",
        homeTeam: home,
        awayTeam: away,
        startsAt: new Date(now + offsetH * 3600_000).toISOString(),
        markets: markets(ref),
      });
    });
  };
  push("football", FOOTBALL, footballMarkets);
  push("basketball", BASKETBALL, basketballMarkets);
  return out;
}

export class SandboxOddsProvider implements OddsProvider {
  readonly name = "sandbox";
  readonly isSandbox = true;
  readonly bulkMarketTypes = ["MATCH_RESULT", "DOUBLE_CHANCE", "OVER_UNDER", "BTTS", "MONEYLINE"] as const;

  async fetchFixtures(sports: string[]): Promise<ProviderFixture[]> {
    return buildFixtures().filter((f) => sports.includes(f.sportKey));
  }

  async fetchResults(providerRefs: string[]): Promise<ProviderResult[]> {
    const now = Date.now();
    const all = buildFixtures();
    return providerRefs.flatMap((ref) => {
      const fx = all.find((f) => f.providerRef === ref);
      if (!fx) return [];
      const finished = new Date(fx.startsAt).getTime() + 2 * 3600_000 < now;
      const r = rngFor(hash(ref + ":score"));
      const cap = fx.sportKey === "basketball" ? 60 : 4;
      const base = fx.sportKey === "basketball" ? 95 : 0;
      return [
        {
          providerRef: ref,
          homeScore: base + Math.floor(r() * cap),
          awayScore: base + Math.floor(r() * cap),
          finished,
        },
      ];
    });
  }
}
