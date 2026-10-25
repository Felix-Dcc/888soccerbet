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

First super admin: `npm run db:seed` creates `admin@kingsbet.gh` as `SUPER_ADMIN`; change its
password immediately in production. Further admins are created at `/admin/admins`.

Tests: `npm test` (unit, includes the permission engine) and `npm run test:int` (database:
admin creation and links, self-edit and last-super-admin guards, referral attribution, per-admin
isolation, GGR reconciliation, ledger adjustments, audit chain and append-only trigger).

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
