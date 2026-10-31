# 888SoccerBet

A sandbox online sportsbook: football & basketball, pre-match and live, with a
server-authoritative bet engine, a double-entry ledger wallet, idempotent payment
webhooks, settlement, and an operations console.

> **Not for real-money use.** 888SoccerBet is a demonstration platform. It holds no Gaming
> Commission of Ghana licence, integrates no licensed trading or payment provider, and
> moves no real money. Every external integration here is a clearly-labelled **sandbox
> adapter**. See [`docs/LAUNCH-READINESS.md`](docs/LAUNCH-READINESS.md).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | one codebase for UI + API, server components for data |
| DB | PostgreSQL + Prisma | relational integrity, transactions, migrations |
| Money | integer pesewas (`BigInt`) + milli-odds (`int`) | no floats ever touch a balance |
| Auth | scrypt (`node:crypto`) + DB sessions | no native build step, tokens hashed at rest |
| Jobs | DB-backed worker (`npm run worker`) | no Redis dependency for the MVP |
| Tests | Vitest | pure-logic + DB integration |

Chosen deliberately over a microservices split: the money-critical core must be one
reliable transactional unit. Providers are isolated behind adapters (below), so the
sportsbook feed or PSP can be swapped without touching the engine.

## Quick start

```bash
cp .env.example .env            # then set DATABASE_URL + secrets (see below)
npm install
npm run db:migrate              # creates tables
npm run db:seed                 # house accounts, admin + demo users, fixtures
npm run dev                     # http://localhost:3000
npm run worker                  # (separate shell) keeps odds fresh & settles finished games
```

Seed logins (phone or email): `admin@888soccerbet.com` / `0240000002` / `Admin123!` ·
`demo@888soccerbet.com` / `0240000001` / `Demo1234!`. Demo referral link: `/register?ref=DEMOKING`.

### Accounts, matches and booking codes

- **Sign-up** is two steps (email + password + confirm → name, mobile, date of birth,
  referral code). `?ref=CODE` prefills the referral; every player gets their own code on
  the Account page. Phones are stored as `0XXXXXXXXX` and are unique, so `0241234567`,
  `+233 24 123 4567` and `233241234567` are the same login.
- **Log in** with phone or email. "Remember me" off = browser-session cookie, 12h server expiry.
- **Match list** is a table grouped by day with market tabs; tabs appear only for markets
  the feed actually supplies. Each fixture has a public numeric ID (`Fixture.code`, from 1000001).
- **Booking codes** (`POST /api/bookings`, `GET /api/bookings/:code`) store selection ids
  server-side, so a code works on any device. Loading always re-reads current odds and
  reports legs that have closed. A saved betslip is revalidated the same way on page load
  (`POST /api/betslip`).
- **Photography** is self-hosted in `public/img` (Unsplash License; photographers and
  licence checks in `public/img/CREDITS.md`), registered in `src/lib/photos.ts` and served
  through `next/image` (resized AVIF/WebP). Photos are deliberately generic — no club crests,
  kits or sponsor branding — so none implies a particular team or fixture. Crests are also
  resized by the optimizer, which is allow-listed to TheSportsDB hosts only.
- **Team crests and league artwork** come from TheSportsDB (`src/lib/assets.ts`), cached in
  `TeamAsset` and on `Competition`. A crest is used only if the **sport and exact team name**
  verify (the free API's single search hit is sometimes a same-name club in another sport);
  otherwise the UI shows initials. Rate-limit responses are never recorded as misses. The
  worker backfills every `ENRICH_INTERVAL_MS` (10 min) at a free-tier-safe pace; this uses no
  Odds API credits. League photos are shown blurred as ambient backgrounds because they
  aren't photos of the listed fixture. No player images are used: without line-up data they
  would imply something the data doesn't say.
- **Kick-off cut-off**: started matches are closed (engine, bookings and UI share
  `isBettable` in `src/lib/markets.ts`) unless `LIVE_BETTING=true` with an in-play feed.

### Local database on this machine

This repo is wired to a **self-contained PostgreSQL cluster** created for development,
isolated from your system Postgres (it runs on **port 5433**, data in `.localdb/`, role
`soccerbet`). Your existing Postgres on 5432 was not touched. Control it with:

```bash
PG="/c/Program Files/PostgreSQL/18/bin"
"$PG/pg_ctl.exe" -D "./.localdb" -o "-p 5433" -l "./.localdb/server.log" start   # start
"$PG/pg_ctl.exe" -D "./.localdb" stop                                            # stop
"$PG/pg_ctl.exe" -D "./.localdb" status                                          # status
```

To use a different PostgreSQL instead, just point `DATABASE_URL` at it and re-run
`npm run db:migrate && npm run db:seed`.

### Configuration (`.env`)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | signs sessions / HMACs — **set a 32+ byte random value** |
| `PAYMENT_WEBHOOK_SECRET` | HMAC secret for the sandbox webhook |
| `DATA_PROVIDER` | `thesportsdb` (default, no odds) · `theoddsapi` (real odds) · `sandbox` (dev only) |
| `ODDS_API_KEY` | required only for `theoddsapi` |
| `ODDS_MARKETS` | bulk markets per league, default `h2h,spreads,totals` (1X2/moneyline, handicap, totals) |
| `ODDS_EXTRA_MARKETS` | per-match markets to request; default all that settle from the final score: GG/NG, double chance, draw no bet, every over/under and handicap line, team totals, correct score, odd/even. 1 credit per market returned, per match |
| `ODDS_EXTRA_FIXTURES` / `ODDS_EXTRA_RESERVE` | how many top football matches get those markets (default 2), and the credit floor below which they pause and their prices are suspended (default 150) |
| `SYNC_INTERVAL_MS` / `SETTLE_INTERVAL_MS` | worker cadence, default 48h / 96h (~495 of the free tier's 500 credits/month) |
| `LIVE_SCORES_INTERVAL_MS` / `LIVE_SCORES_RESERVE` | live-score refresh, default every 10 min; 1 credit per league with a match in play, paused when credits left fall to the reserve (default 150) |
| `LIVE_BETTING` | `false` (default): started matches closed. `true` only with an in-play odds feed |
| `NEXT_PUBLIC_TIMEZONE` | kick-off display zone, default `Africa/Accra` |
| `TEST_DATABASE_URL` | optional; integration tests default to `<db>_test` |
| `PAYMENT_PROVIDER` | `sandbox` only (no licensed PSP ships here) |
| `MIN_STAKE_GHS` / `MAX_STAKE_GHS` / `MAX_PAYOUT_GHS` / `MAX_ACCA_LEGS` | limits |
| `MIN_DEPOSIT_GHS` | smallest deposit, default 50 (minimum stake `MIN_STAKE_GHS` defaults to 250) |
| `VERIFY_DEPOSIT_GHS` | withdrawal verification: once verification applies (see `VERIFY_AFTER_WIN_GHS`), a player makes 2 separate verification payments of this amount (default 500) from the wallet. Normal deposits do not count. The money is held (not spendable) until an admin approves or rejects in the console; either way it is released to the player's balance, and only approval unlocks withdrawals |
| `VERIFY_AFTER_WIN_GHS` | withdrawal verification only applies once the player has won a bet paying out more than this (default 1000); before that they can withdraw without it |
| `CASHOUT_MARGIN_PCT` | house margin on cash out offers (default 5): offer = (potential win / current odds of the open legs) less this percent. Cash out (full, partial, auto) is only offered while every open leg has a live pre-match price |
| `LEGAL_ENTITY`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` | operator details shown on /terms and /privacy. Until set, the pages say they are still to be registered rather than inventing them |
| `GAMING_LICENCE`, `DPC_REGISTRATION` | Gaming Commission of Ghana licence and Data Protection Commission registration numbers. While `GAMING_LICENCE` is blank the Terms state the site is unlicensed and runs with no real money |
| `CRON_TOKEN` | required in production to call `POST /api/cron` |

## Provider adapters (swappable)

- **Odds** — `src/lib/providers/odds/`: `OddsProvider` interface, `SandboxOddsProvider`
  (deterministic, offline) and `TheOddsApiProvider` (real pre-match odds — an odds feed
  only, **not** a licensed sportsbook).
- **Payments** — `src/lib/providers/payments/`: `PaymentProvider` interface and
  `SandboxMomoProvider` (signed, idempotent webhooks). Replace with Paystack/Hubtel/
  Flutterwave once merchant credentials exist.

## Tests

```bash
npm test          # pure logic: money, odds, grading, hashing, webhooks, phones, betting window (no DB)
npm run test:int  # integration against a real DB (see below)
```

`test:int` runs against its **own** database (`<DATABASE_URL db>_test`, or
`TEST_DATABASE_URL`), wiped and re-migrated before every run; it refuses to reset any
database not named `*_test`, so development data is never touched. It covers: parallel
bets can't overspend, replayed webhooks credit once, settlement pays out exactly once, the
ledger stays balanced, started matches are refused, booking codes round-trip at current
odds, and referral/phone/email registration and login.

## Build / deploy

```bash
npm run build && npm start
```

Production runs on Railway (project `888soccerbet`): `web` (the site; `npm start` applies migrations
first), `worker` (same code with `SERVICE_ROLE=worker`), `Postgres`, and `db-backup`. Deploy with
`railway up --service web` / `--service worker` from this folder. 888soccerbet.com points at `web` via
Cloudflare DNS.

## Going live with ShinobiPay

ShinobiPay (`src/lib/providers/payments/shinobipay.ts`) takes deposits; it has no API to pay
players, so withdrawals are paid by an admin. On ShinobiPay's dashboard (test keys first):

1. Register the webhook URL `https://888soccerbet.com/api/webhooks/payments`; copy the **signing secret**
   (`whsec_...`, shown once).
2. Copy the **secret key** (`sk_test_...`).
3. Railway > 888soccerbet > `web` > Variables: set `SHINOBI_SECRET_KEY`, `SHINOBI_WEBHOOK_SECRET`, then
   `PAYMENT_PROVIDER=shinobipay`.
4. Test: a deposit (approve the prompt on the phone), then a withdrawal. It appears in admin >
   Trading desk > **Withdrawals to pay**; send the MoMo, then click **Paid** (or **Failed** to refund).
   ShinobiPay's test mode settles by the reference, so test deposits succeed. Then switch to `sk_live_`.

Deposits are credited only from a signed webhook (HMAC-SHA256, 5-minute window) after the intent is
re-read from ShinobiPay's API. Admins need the `payments.payout` permission to mark withdrawals,
each decision asks for their password and is recorded in the audit trail.

## Going live with Flutterwave

The Flutterwave adapter (`src/lib/providers/payments/flutterwave.ts`) is built and tested; the site
uses the sandbox until it is switched on. On Flutterwave's dashboard (test mode first):

1. Settings > Webhooks: URL `https://888soccerbet.com/api/webhooks/payments`, type a long random
   **Secret hash**, and turn webhooks on.
2. Settings > API keys: copy the **Secret key**.
3. Railway > 888soccerbet > `web` > Variables: set `FLW_SECRET_KEY`, `FLW_SECRET_HASH` (same value as
   step 1), then `PAYMENT_PROVIDER=flutterwave`. Railway redeploys; System in the admin console
   shows Payments as flutterwave (sandbox while the key is a TEST key).
4. Make one small deposit and one withdrawal on each network (MTN, Telecel, AirtelTigo). Then
   repeat steps 1-3 with the live keys.

Deposits send the player to Flutterwave's approval page and are credited only by the webhook,
after the amount, currency and reference are re-checked with Flutterwave's API. Withdrawals hold
the money first, then ask Flutterwave to pay; a clear refusal returns the money at once, an
unclear reply leaves it held until the webhook settles it.

## Backups

`db-backup` is a Railway cron job (`ops/db-backup/`) that runs at 03:00 UTC every night: it
`pg_dump`s the production database into the private `db-backups` bucket as
`daily/888soccerbet-<UTC time>.sql.gz` and deletes copies older than 30 days. Its credentials are Railway
variable references to `Postgres` and `db-backups`, so no secret is stored in this repo.

- Run one now: `railway cron run --service db-backup --yes`; check with `railway logs --service db-backup`.
- Restore: download the file from the bucket (Railway dashboard → db-backups), then
  `gunzip -c 888soccerbet-<time>.sql.gz | psql "<empty database URL>"`. Restore into a new, empty
  database first and check it before pointing the site at it.

Deployment notes, security checklist and launch blockers are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/LAUNCH-READINESS.md`](docs/LAUNCH-READINESS.md). Brand and design rationale are in
[`docs/BRAND.md`](docs/BRAND.md); the functional spec distilled from the reference is in
[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Privacy & cookies

The site sets one cookie (`stk_session`, sign-in) and three local/session storage keys (betslip, hide-balance, splash), all strictly necessary or the player's own choice, so it needs no cookie banner. Adding analytics, ads or any third-party script changes that: ask for consent first and update `/cookies` and `/privacy`. Sign-up records consent (`User.termsAcceptedAt`, `termsVersion`); bump `TERMS_VERSION` in `src/lib/legal.ts` when the Terms or Privacy Policy change materially.

## Admin console

Role-based admin system with granular permissions, multi-admin management, per-admin referral codes and dashboards, scoped financial analytics, CSV exports, system health and a tamper-evident audit log. Permissions, financial definitions, migrations, deployment steps and remaining blockers: see [docs/ADMIN.md](docs/ADMIN.md).
