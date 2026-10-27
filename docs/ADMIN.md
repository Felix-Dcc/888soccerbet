# Admin system

The admin console lives at `/admin`. Access is **denied by default** and decided on the server for
every page and API route; hiding a link in the menu is only a convenience.

## Roles and permissions

| Role | Access |
|---|---|
| `USER` | Players. No admin access. |
| `ADMIN` | Exactly the permissions of their **role** (a named set, see `/admin/roles`) **plus** their individual grants **minus** their individual denials. |
| `SUPER_ADMIN` | Every permission, and the only accounts that can manage admins and roles. |

Permission catalogue (`src/lib/permissions.ts`):

| Permission | Allows |
|---|---|
| `dashboard.view` | The admin dashboard |
| `reports.view` | Global financial figures and the control center |
| `reports.export` | CSV exports (global with `reports.view`, otherwise own referrals only) |
| `users.view` | Search and open any player, including phone, date of birth and limits |
| `users.suspend` | Suspend / reactivate players |
| `wallets.adjust` | Correct a player balance with a ledger adjustment |
| `bets.view` | Bet history, open exposure |
| `payments.view` | Deposits and withdrawals on player profiles |
| `payments.payout` | Withdrawals to pay by hand (trading desk): mark paid, or failed to refund |
| `verification.review` | Approve / reject withdrawal verification |
| `settlement.manage` | Settle and void matches |
| `fixtures.manage` | Add manual games |
| `odds.sync` | Run the odds sync / settle job |
| `referrals.view` | Your own referred players and their activity |
| `referrals.view_all` | Every admin's referral network |
| `admins.view` | Administrators and their performance |
| `audit_logs.view` | The audit log |
| `system.view` | System health and providers |

`admins.manage` and `roles.manage` are **not grantable**: only `SUPER_ADMIN` has them. Rules enforced in
`src/lib/admins.ts` whatever calls them:

- Nobody can change their own access or status (no self-escalation, no self-suspension).
- The last active super admin can't be suspended or demoted.
- Every sensitive action asks for the actor's password again (`confirmPassword`, rate-limited).
- New admins and password resets get a **single-use link** (72 h setup / 24 h reset); only its
  hash is stored, a new link cancels older ones, and resets/suspensions sign the admin out.
- Unknown permission strings are dropped on save and never honoured.

## Referrals

Each admin gets a permanent, unique code `ADM-XXXX-XXXX` (8 random symbols, nothing from the
admin's name or username), stored without dashes (`ADMH9ZQHQDG`); typed codes are matched case- and
dash-insensitively. The link is `<SITE_URL>/register?ref=<code>`. Players don't have referral
codes: only an admin's code is accepted at sign-up.

At sign-up the server validates the code and writes `referredById`, `referredAt` and
`referralSource` (`LINK` or `CODE`) **once**; nothing updates them afterwards, so attribution
can't be reassigned or overwritten by another link. A suspended admin's code stops attributing
new sign-ups; players already attributed keep their attribution.

## Financial definitions (`src/lib/adminAnalytics.ts`)

All figures come from database records; money is integer pesewas.

- **Deposits / withdrawals**: successful payments created in the range. Withdrawal-verification
  payments are reported separately (they are held and returned, not revenue).
- **Stakes placed**: stakes of bets placed in the range, including parts later cashed out.
  Player activity, **not** revenue.
- **Winnings paid / losing stakes / void refunds**: bets settled in the range.
- **GGR**: the house P&L ledger for betting transactions in the range (losing stakes − winnings −
  refunds − cash out differences). It reconciles with the ledger by construction (tested).
- **NGR** = GGR − bonuses. There is no bonus programme, so bonuses are 0.
- **Balance corrections**: net credited to players by staff adjustments; a cost outside GGR.
- **Owed to players**: balances + open stakes + held verification money, right now.
- **Profit is not reported**: provider fees and operating costs aren't recorded.
- **Commission**: no programme is configured, so none is calculated (see blockers).

A per-admin view applies the same queries filtered to the players that admin referred.

## Audit log

Every admin action is written by `audit()` (`src/lib/audit.ts`) with actor, target, before/after
values and time, inside the same transaction as the change. Each entry stores a SHA-256 hash of
its content plus the previous entry's hash; `verifyAuditChain()` (shown on `/admin/audit` and
`/admin/system`) detects any edit or removal. The database also refuses `UPDATE`/`DELETE` on the
table (trigger `audit_log_no_update_delete`).

## Player management

Balances are never edited. `wallets.adjust` posts a balanced ledger transaction
(`ADMIN_ADJUSTMENT`: player cash ↔ house P&L) with a reason and an idempotency key, refuses to
make a balance negative, and records before/after balances in the audit log. A mistake is fixed
with an opposite correction. Settled bets are never changed from the console.

## Migrations and deployment

New migrations (apply with `npx prisma migrate deploy`, stop the app first on Windows):

1. `*_admin_permissions`: `SUPER_ADMIN` role; `AdminRole`; `AccountToken`; admin fields,
   `referredAt`/`referralSource` on `User`; `before`/`after`/`seq`/`prevHash`/`hash` on `AuditLog`.
2. `*_promote_existing_admins`: existing `ADMIN` accounts become `SUPER_ADMIN` (they already had
   full access). Data-only; separate because Postgres can't use a new enum value in the same
   transaction.
3. `*_audit_log_append_only`: the trigger that blocks edits/deletes on `AuditLog`.

Existing audit entries (before chaining) keep `hash = NULL` and are skipped by verification.

Settings (`.env`):

| Variable | Purpose |
|---|---|
| `SITE_URL` | Public address used in referral links (falls back to the request host) |
| `STALE_ODDS_HOURS` | Alert when odds are older than this (default 50) |
| `UNSETTLED_AFTER_HOURS` | Alert for matches unsettled this long after kick-off (default 4) |
| `PENDING_PAYMENT_ALERT_MINUTES` | Alert for payments pending longer than this (default 60) |
| `DEFAULT_REFERRAL_CODE` | An administrator's code: players who sign up without a code are attributed to them (shown as auto-assigned). A typed or linked code still wins. Blank = unattributed |

First super admin: `npm run db:seed` creates `admin@kingsbet.gh` as `SUPER_ADMIN`; change its
password immediately in production. Further admins are created at `/admin/admins`.

Tests: `npm test` (unit, includes the permission engine) and `npm run test:int` (database:
admin creation and links, self-edit and last-super-admin guards, referral attribution, per-admin
isolation, GGR reconciliation, ledger adjustments, audit chain and append-only trigger).

## Live (in-play) betting

Off unless `LIVE_BETTING=true` on **both** the web and worker services. Live betting runs on the
match result (1X2) only, in the leagues listed in `LIVE_BETTING_LEAGUES` (default the EPL), plus
generated football matches. Every other league closes at kick-off. With it on:

- At kick-off every market except the match result closes (handicap, over/under, per-match extras).
- A score change suspends all the match's open markets at once. They reopen only when odds fetched
  *after* the change arrive. Odds already in flight when the goal landed are thrown away.
- The worker refreshes the match result every `LIVE_ODDS_INTERVAL_MS`, only for listed leagues
  with a match in play.
- A live bet is refused when the match's odds are older than `LIVE_ODDS_MAX_AGE_MS`. Cash out on it
  pauses too.
- A live bet is held `LIVE_BET_HOLD_MS`, then refused if the score or price moved meanwhile. The
  pick is re-checked as still open inside the bet transaction.
- Generated football matches ("Generate match") are priced locally on the worker every 10 seconds
  from the score and minutes left only, never their pre-set result. Every market stays live in play.
  A goal suspends their markets for 10 seconds. They cost no credits. Picks the score has ruled out
  (e.g. correct score 0-0 once it's 1-0) close, and so does any market whose likeliest pick is above
  90% (both teams to score once both have scored; draw no bet and double chance near the end).
- Generated basketball and hand-entered games take no live bets. Basketball scores ramp toward the
  pre-set final, and nothing reprices hand-entered games.

Generated matches' markets: football has match result, over/under, both teams to score, double
chance, draw no bet, odd/even and correct score (0-0 to 4-4 plus "Other"). Basketball has match
winner, total points and odd/even. All football prices, before and during the match, come from one
model of the final score with the house margin applied to each pick. The markets can't contradict
each other: no set of picks across them wins in every outcome. The hand-entered "Add a manual
game" form is unchanged.

| Variable | Purpose |
|---|---|
| `LIVE_BETTING` | `true` to take bets on matches in play (default off) |
| `LIVE_BETTING_LEAGUES` | Feed leagues that take live bets, comma-separated (default `soccer_epl`; empty = none) |
| `LIVE_ODDS_INTERVAL_MS` | In-play match-result refresh for those leagues (default 60000 = 60s) |
| `LIVE_ODDS_MAX_AGE_MS` | Live bets close when odds are older than this (default 90000 = 90s); keep it above the refresh interval |
| `LIVE_BET_HOLD_MS` | How long a live bet is held before it's re-checked and accepted (default 5000 = 5s) |
| `LIVE_BETTING_SCORES_INTERVAL_MS` | Score poll for live-betting leagues, which drives goal suspensions (default 60000 = 60s) |
| `LIVE_SCORES_INTERVAL_MS` | Score poll for every other league: settles and pays out after the final whistle (default 300000 = 5 min) |
| `LIVE_ODDS_RESERVE` | Live odds pause at this many credits left (default 300; never below `LIVE_SCORES_RESERVE`). Live bets then close by themselves as odds age |
| `LIVE_SCORES_RESERVE` | Live scores pause at this many credits left (default 150) |

Order as credits run out: live odds stop first (300), then live scores and per-match extras (150).
The pre-match sync never pauses.

Credit cost on the $30 plan (20,000 credits a month), per hour a league has a match in play:

| | Odds | Scores | Per hour |
|---|---|---|---|
| A live-betting league (EPL) | 1 (h2h) x 60 | 1 x 60 | **120** |
| Any other league | none | 1 x 12 | **12** |

Matches in the same league share the cost. Pre-match, with `SYNC_INTERVAL_MS` at 4 hours: bulk odds
cost 18 credits a run (6 leagues x 3 markets), about 3,240 a month. Per-match extras cost up to ~8
credits per match per run, about 1,440 a month for each match in `ODDS_EXTRA_FIXTURES`. With
`ODDS_EXTRA_FIXTURES=2` that's about 6,100 a month for pre-match; with 4 it's about 9,000. The
latter, with ~65 hours of EPL play (~7,800) and the other leagues' scores (~4,600), goes over 20,000.

Limit: both feeds poll, so a goal is seen up to the scores feed's own lag plus one 60s poll after it
happens. The 5-second hold refuses bets placed in the last moments before a goal is seen. Bets taken
earlier in that window are still at pre-goal prices.

## Not built yet (production blockers)

- **Commission programme**: rates, models (fixed / % / tiered), caps, approval and payout rules
  aren't defined. Nothing is calculated or paid until they are.
- **Email delivery**: setup and reset links are shown once to the super admin to send; there is
  no email provider configured.
- **Two-factor authentication** for admins (strongly recommended before launch).
- **Rate limits are in memory**: fine for one server; use a shared store (e.g. Redis) when running
  several instances.
- **Cost data**: provider fees and operating expenses aren't recorded, so profit isn't shown.
- **Bonuses**: there is no bonus programme to manage or report.
- **Support cases / account notes**: the `SupportTicket` table exists but has no console UI.
- **Withdrawal approval queue**: withdrawals go straight to the payment provider (held, refunded
  on failure); there is no manual approval step to review.
- **Alert settings** are environment variables, not editable in the console.
