# Launch readiness — blockers to real-money operation

888SoccerBet's software core is built and tested, but a functioning website is **not**
authorised to accept bets. The following are required before any real-money launch, and
none can be satisfied by code alone.

## Hard regulatory/commercial blockers

1. **Gaming Commission of Ghana licence (Act 721).** Reported requirements (confirm with
   the Commission directly):
   - Ghanaian limited-liability company with an identifiable local office.
   - Minimum stated capital for sports betting widely cited at **US$2,000,000**; licence
     fee ~2% of stated capital. *(Secondary sources — verify.)*
   - Service mark/logo registered with the Registrar of Companies; director criminal
     clearance; tax clearance (GRA); SSNIT; Data Protection Commission registration.
   - Foreign participants also register with the GIPC (its own minimums).
   - **Qualified Ghanaian gaming-law counsel must review before launch.**
2. **Licensed B2B sportsbook / trading platform.** An odds API is not a sportsbook. Real
   operation needs a provider that supplies live pricing **plus** risk management,
   liability control, suspension and settlement under commercial terms. 888SoccerBet's engine
   is built to sit behind such a feed via the `OddsProvider` adapter — the commercial
   agreement and credentials are outstanding.
3. **Licensed payment / Mobile Money aggregator.** Approved merchant credentials with a
   provider (e.g. Paystack, Hubtel, Flutterwave) and the MoMo schemes. Replace
   `SandboxMomoProvider`; wire the real signed webhook. No real funds move until then.
4. **KYC/AML identity verification.** `KycStatus` is modelled but no ID-document / liveness
   provider is integrated. Required for verification, limits and AML.

## Engineering items before production (no external dependency)

- [ ] Replace in-process rate limiter with a shared store (Redis) for multi-node.
- [ ] Drive settlement through the durable `Job` queue with locking (not `setInterval`).
- [ ] Email/SMS for verification, password recovery (recovery flow is modelled, not wired).
- [ ] Bonus/promotions engine with real funding and wagering rules (currently
      presentational).
- [ ] Geo-eligibility / IP checks; device + fraud signals.
- [ ] Centralised structured logging + error monitoring (e.g. Sentry) and alerting.
- [ ] Betting-tax handling (Ghana withholding on winnings) once the rate is confirmed in
      law — intentionally **not** hardcoded.
- [ ] Load/soak testing of the engine under production-like concurrency.
- [ ] Full admin surfaces for withdrawals approval queue, user KYC review, and support.

## What IS done and verified

- Server-authoritative bet engine; double-entry ledger; concurrency-safe balances;
  idempotent deposits/settlements/withdrawals; market suspension and odds-change handling;
  settlement with void handling; RBAC; rate limiting; input validation; migrations;
  financial reporting; responsive UI; pure-logic + DB integration tests; clean production
  build. See `README.md` and `docs/ARCHITECTURE.md`.

## Integration status at a glance

| Integration | Status |
|---|---|
| Fixtures / teams / logos / scores | **REAL & verified** — TheSportsDB (`DATA_PROVIDER=thesportsdb`, default). A live request succeeds and real EPL/LaLiga/Serie A/Bundesliga/Ligue 1/NBA fixtures render in the UI. Free test key caps results to ~1 event/league; a premium key lifts it. No bookmaker odds (data feed only). |
| Odds / markets | **Real, gated on a key** — The Odds API (`DATA_PROVIDER=theoddsapi` + `ODDS_API_KEY`, free tier 500 req/mo). Without it, markets show "odds not available" — **never fabricated**. Production refuses the sandbox odds generator. |
| Payments / MoMo | **Sandbox** (signed webhooks, no real money) |
| KYC/AML | **Not integrated** (status modelled) |
| Licensing | **None** |

### What a real request proved (verification evidence)

- `GET thesportsdb.com/.../eventsnextleague.php?id=4328` returned real data; `syncFixtures()`
  stored 6 real fixtures (e.g. *Ipswich Town v Nottingham Forest, Portman Road, 2026-10-23
  19:00*, *Oklahoma City Thunder v Denver Nuggets, Paycom Center*) with real badges, venues
  and kickoff times; the homepage renders them with logos and an honest "Odds not available
  yet" state.
- Provider-selection guard verified: `NODE_ENV=production` + `DATA_PROVIDER=sandbox` resolves
  to TheSportsDB, not the simulator — production cannot silently serve invented odds.
