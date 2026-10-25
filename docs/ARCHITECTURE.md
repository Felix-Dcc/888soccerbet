# Architecture

## Components (separated, as required)

```
odds provider ─┐
               ├─► sync (src/lib/sync.ts) ─► DB (fixtures/markets/selections)
results feed ──┘
                                   ┌─► bet engine (betEngine.ts)   ─┐
customer UI ─► API routes ─────────┤─► wallet (wallet.ts)           ├─► ledger (ledger.ts, double-entry)
                                   └─► settlement (settlement.ts)  ─┘            │
payment PSP ─► webhook route ─► wallet.processPaymentEvent ──────────────────────┘
auth/session (auth.ts, session.ts) ── RBAC on every protected route
admin console ─► reporting (reporting.ts) ─► reads ledger
worker (worker.ts) ─► sync + auto-settle on an interval
```

Each boundary is an interface so a commercial service can replace a sandbox adapter
without rewriting the engine: `OddsProvider`, `PaymentProvider`.

## Database design (key tables)

- **User / Session** — accounts, RBAC (`Role`), status, KYC, responsible-gambling limits.
- **Sport / Competition / Fixture / Market / Selection** — the catalogue. Odds live on
  `Selection.milliOdds` (integer). Markets/selections carry status for suspension.
- **LedgerAccount / LedgerTransaction / LedgerEntry** — double-entry core. Entries are
  signed `BigInt` pesewas; every transaction's entries sum to zero; balances are
  `SUM(amount)` over an account. House accounts are fixed-id singletons.
- **Bet / BetSelection** — placed bets with per-leg odds snapshots and statuses.
  `idempotencyKey` unique; `ref` human-facing.
- **PaymentIntent / WebhookEvent** — deposits/withdrawals and the processed-callback
  ledger that guarantees at-most-once handling.
- **AuditLog / Job / SupportTicket** — ops, background queue, support.

Money = integer pesewas; odds = integer milli-odds. Floats never touch a balance. See
`prisma/schema.prisma`.

## Correctness mechanisms

- **Concurrency**: per-user cash row lock (`FOR UPDATE`) serialises placement and
  withdrawal holds → no overspend under parallel requests (tested).
- **Idempotency**: bets (`Bet.idempotencyKey`), settlements (`bet_settle:<id>` reference),
  deposits (`deposit:<ref>` + `WebhookEvent` unique), withdrawals (`wdr_hold/reverse:<ref>`).
- **Auditability**: the whole-ledger invariant `SUM(all entries) = 0` is asserted in
  tests and surfaced on the admin dashboard.
- **Settlement**: pure grading (`grade()`), leg-level results, void legs collapse to odds
  1.0 and payout is recomputed from surviving legs; retries are no-ops.

## Security configuration

- Session tokens are random 256-bit secrets; only their SHA-256 is stored. Cookies are
  `httpOnly`, `sameSite=lax`, `secure` in production.
- Passwords: scrypt with per-password salt; constant-time compare.
- Rate limiting on auth, bets and wallet (in-process; swap for Redis on multi-node).
- Security headers set in `next.config.mjs` (X-Frame-Options, nosniff, Referrer-Policy,
  Permissions-Policy).
- Webhooks require a valid HMAC signature; `/api/cron` requires `CRON_TOKEN` in prod;
  `.env` is never served.
- Zod validates every request body at the trust boundary.

## Deployment

1. Provision PostgreSQL; set `DATABASE_URL`.
2. Set strong `AUTH_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `CRON_TOKEN`.
3. `npm ci && npm run build`.
4. `npm run db:deploy` (applies migrations), optionally `npm run db:seed` for demo data.
5. `npm start` for the web app; run `npm run worker` as a separate always-on process, or
   schedule `POST /api/cron` (with `x-cron-token`) from an external scheduler.
6. Put the app behind TLS; point the PSP's webhook at `/api/webhooks/payments`.

### Scaling notes (documented limitations)

- Rate limiter and the worker are single-node. Multi-node needs a shared store (Redis)
  and a leader/locked worker (the `Job` table is already present for that).
- The worker uses `setInterval`; for durability under crashes, drive settlement via the
  `Job` queue with locking.
