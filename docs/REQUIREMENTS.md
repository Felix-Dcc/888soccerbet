# Functional requirements (distilled from the reference)

The reference (a Ghana-facing sportsbook) was inspected for **functionality only**. Its
name, artwork, copy and page composition were not reused. Observed capabilities and how
Kingz Bet implements each:

| Reference capability | Kingz Bet implementation | Status |
|---|---|---|
| Sports navigation (Soccer, etc.) | Sport catalogue (`Sport`), nav + filter chips | ✅ football, basketball |
| Competition / fixture discovery | `Competition`, `Fixture`, home + live pages | ✅ |
| Match → market organisation | `Market` + `Selection`, fixture detail page | ✅ 1X2, DC, O/U, BTTS, moneyline, totals |
| Pre-match + live events | `FixtureStatus` SCHEDULED/LIVE, live page, score display | ✅ (live = kickoff passed; scores from feed) |
| Featured / today / upcoming lists | ordered fixture queries | ✅ |
| Odds display per outcome | odds buttons, milli-odds exact math | ✅ |
| Betslip (add/remove, stake, combined odds, potential return) | `BetslipContext` + `Betslip`, server-recomputed | ✅ |
| Single + accumulator bets | `BetType`, `combineMilliOdds`, correlated-leg block | ✅ |
| Odds changes before placement | server re-reads odds, `ODDS_CHANGED` + accept flow | ✅ |
| Market suspension | `MarketStatus`/`SelectionStatus`, engine rejects | ✅ |
| Bet references & history | `Bet.ref`, `/bets` page, `/api/bets` | ✅ |
| Settlement states | PENDING/WON/LOST/VOID, leg-level grading | ✅ |
| Registration / login / account | scrypt + sessions, `/register` `/login` `/account` | ✅ |
| Verification (KYC) | `KycStatus` field + admin flag | ⚠️ status modelled; no ID-document provider |
| Wallet (GHS) + deposits/withdrawals | double-entry ledger, MoMo sandbox, webhooks | ✅ sandbox |
| Transaction history | `/wallet` statement + `PaymentIntent` list | ✅ |
| Promotions / bonuses | `/promotions` page | ⚠️ presentational; bonus engine not funded |
| Responsible gambling (limits, self-exclusion) | per-user limits enforced server-side | ✅ |
| Customer support entry points | account page + support model | ⚠️ entry points only |
| Mobile navigation / responsive | mobile-first layout, betslip drawer | ✅ |
| Administration & operations | `/admin` console, settlement, reports, audit | ✅ sandbox-scoped |

Legend: ✅ working · ⚠️ partial/modelled (see Launch Readiness).

## Server-authority rules (non-negotiable)

1. All bet acceptance and every financial calculation happen on the server
   (`src/lib/betEngine.ts`), never trusted from the client.
2. Deposits are credited **only** from a verified, idempotent provider webhook — never
   from a frontend success (`src/lib/wallet.ts`).
3. Every money movement is a balanced double-entry ledger transaction; balances are
   derived, never mutably stored (`src/lib/ledger.ts`).
4. Concurrency is serialised per user via `SELECT … FOR UPDATE` on the cash account row.
5. Idempotency is enforced at two layers (unique business key + unique ledger reference)
   for bets, settlements, deposits and withdrawals.
