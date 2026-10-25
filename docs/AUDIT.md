# Data audit & remediation

## Where simulated data lived (root cause)

A codebase scan (`Math.random`, `rngFor`, static team arrays, hardcoded fixtures) found the
fabricated data **confined to two files**, not scattered:

- `src/lib/providers/odds/sandbox.ts` — a deterministic generator of demo fixtures + odds,
  always clearly labelled "sandbox" in the UI.
- `src/lib/providers/odds/index.ts` — the provider factory, which **silently fell back to
  the sandbox** when no real provider/key was configured. This was the one genuinely
  misleading behaviour.

Everything else (bet engine, ledger, settlement, wallet) already used real DB records; the
betslip's combined-odds calc is a legitimate client mirror of the server calculation.

## Fixes applied

1. **Real fixtures provider** — `src/lib/providers/odds/thesportsdb.ts` pulls genuine
   fixtures, teams, badge logos, venues, seasons and results from TheSportsDB. Verified
   with a live request; data persists via `syncFixtures()` keyed on stable `providerRef`
   (`sdb-<id>`), updating in place rather than duplicating.
2. **No silent fabrication** — the factory now defaults to a real provider and **refuses
   the sandbox in production**. Missing odds → "odds not available", never invented prices.
   `DATA_PROVIDER` selects `thesportsdb` (default) | `theoddsapi` (real odds, needs key) |
   `sandbox` (dev only).
3. **Schema** — added `homeTeamLogo`, `awayTeamLogo`, `venue`, `season` to `Fixture`
   (migration `fixture_metadata`).
4. **UI** — match cards and fixture pages show real logos, venues and competition names;
   an explicit "Odds not available yet" state replaces any faux market; hero copy no longer
   implies odds exist when they don't.

## Honest limitations

- TheSportsDB is a sports-*data* feed, not a sportsbook: it supplies no bookmaker odds, so
  a bettable experience needs `DATA_PROVIDER=theoddsapi` + a key (or a licensed sportsbook
  platform for production wagering).
- The free TheSportsDB test key returns ~1 event per league per call; a premium key returns
  full schedules. The adapter is identical either way.
- "Live" status is inferred from kickoff time (no push feed on these tiers); disclosed in UI.
