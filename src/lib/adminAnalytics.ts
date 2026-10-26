/**
 * Admin analytics, computed from database records only. Definitions (all money in pesewas):
 *  - Deposits / withdrawals: SUCCEEDED payment intents created in the range. Withdrawal-verification
 *    payments are reported apart: they are held and returned, not revenue.
 *  - Stakes placed: stake of bets placed in the range, including parts later cashed out.
 *  - Winnings paid / refunds / losing stakes: from bets settled in the range.
 *  - GGR (gross gaming revenue): the house P&L ledger for betting transactions in the range
 *    (losing stakes - winnings paid - void refunds - cash out differences). It reconciles with the
 *    ledger by construction. Balance corrections are excluded and shown separately.
 *  - NGR = GGR - bonuses. There is no bonus programme, so bonuses are 0.
 *  - Profit is not reported: provider fees and operating costs aren't recorded anywhere yet.
 *  - Liabilities (now): player cash + open stakes in escrow + held verification money.
 * A scope of one admin restricts every figure to players that admin referred.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export type Scope = { kind: "all" } | { kind: "referrer"; adminId: string } | { kind: "player"; userId: string };
export interface Range {
  from: Date;
  to: Date; // exclusive
  key: string;
}

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** ?range=7d|30d|90d|today|all, or ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). Accra is UTC+0. */
export function parseRange(sp: { range?: string; from?: string; to?: string }, now = new Date()): Range {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && iso.test(sp.from) && sp.to && iso.test(sp.to)) {
    const from = new Date(`${sp.from}T00:00:00Z`);
    const to = new Date(new Date(`${sp.to}T00:00:00Z`).getTime() + DAY);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) return { from, to, key: "custom" };
  }
  const tomorrow = new Date(startOfUtcDay(now).getTime() + DAY);
  const days = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[sp.range ?? "30d"];
  if (sp.range === "all") return { from: new Date("2000-01-01T00:00:00Z"), to: tomorrow, key: "all" };
  return { from: new Date(tomorrow.getTime() - (days ?? 30) * DAY), to: tomorrow, key: days ? sp.range! : "30d" };
}

const scoped = (s: Scope) =>
  s.kind === "all"
    ? Prisma.sql`SELECT id FROM "User" WHERE role = 'USER'`
    : s.kind === "player"
      ? Prisma.sql`SELECT id FROM "User" WHERE role = 'USER' AND id = ${s.userId}`
      : Prisma.sql`SELECT id FROM "User" WHERE role = 'USER' AND "referredById" = ${s.adminId}`;

const BETTING_KINDS = Prisma.sql`('BET_LOSS','BET_PAYOUT','VOID_REFUND','CASHOUT')`;
const n = (v: unknown) => (typeof v === "bigint" ? v : BigInt((v as number | string | null) ?? 0));

export interface Metrics {
  players: { total: number; newInRange: number; verified: number; suspended: number; activeBettors: number; depositors: number };
  money: {
    deposits: { count: number; total: bigint };
    withdrawals: { count: number; total: bigint };
    verificationPayments: { count: number; total: bigint };
    pending: { count: number; total: bigint };
    failed: { count: number; total: bigint };
    liabilities: { cash: bigint; escrow: bigint; held: bigint; total: bigint };
  };
  betting: {
    placed: { count: number; stakes: bigint };
    won: { count: number; paid: bigint };
    lost: { count: number; stakes: bigint };
    void: { count: number; refunded: bigint };
    cashouts: { count: number; paid: bigint };
    open: { count: number; stakes: bigint };
  };
  /** settledTurnover: what was staked on the bets settled in the range (for hold %). */
  revenue: { ggr: bigint; bonuses: bigint; ngr: bigint; adjustments: bigint; settledTurnover: bigint; bySource: { lost: bigint; won: bigint; cashout: bigint; void: bigint } };
}

export async function scopeMetrics(scope: Scope, range: Range): Promise<Metrics> {
  const S = scoped(scope);
  const { from, to } = range;
  const [players, pay, liab, placed, settled, cash, open, ggr, adj] = await Promise.all([
    prisma.$queryRaw<{ total: number; fresh: number; verified: number; suspended: number; bettors: number; depositors: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "User" u WHERE u.id IN (${S})) AS total,
        (SELECT COUNT(*)::int FROM "User" u WHERE u.id IN (${S}) AND u."createdAt" >= ${from} AND u."createdAt" < ${to}) AS fresh,
        (SELECT COUNT(*)::int FROM "User" u WHERE u.id IN (${S}) AND u."kycStatus" = 'VERIFIED') AS verified,
        (SELECT COUNT(*)::int FROM "User" u WHERE u.id IN (${S}) AND u.status = 'SUSPENDED') AS suspended,
        (SELECT COUNT(DISTINCT b."userId")::int FROM "Bet" b WHERE b."userId" IN (${S}) AND b."placedAt" >= ${from} AND b."placedAt" < ${to}) AS bettors,
        (SELECT COUNT(DISTINCT p."userId")::int FROM "PaymentIntent" p WHERE p."userId" IN (${S}) AND p.direction = 'DEPOSIT' AND p.status = 'SUCCEEDED'
           AND COALESCE(p.metadata->>'purpose','') <> 'VERIFICATION' AND p."createdAt" >= ${from} AND p."createdAt" < ${to}) AS depositors`,
    prisma.$queryRaw<{ direction: string; status: string; verification: boolean; count: number; total: bigint }[]>`
      SELECT p.direction::text, p.status::text, COALESCE(p.metadata->>'purpose','') = 'VERIFICATION' AS verification, COUNT(*)::int AS count, COALESCE(SUM(p.amount),0)::bigint AS total
      FROM "PaymentIntent" p WHERE p."userId" IN (${S}) AND p."createdAt" >= ${from} AND p."createdAt" < ${to}
      GROUP BY 1, 2, 3`,
    prisma.$queryRaw<{ kind: string; total: bigint }[]>`
      SELECT a.kind::text, COALESCE(SUM(e.amount),0)::bigint AS total FROM "LedgerAccount" a JOIN "LedgerEntry" e ON e."accountId" = a.id
      WHERE a."userId" IN (${S}) AND a.kind IN ('USER_CASH','BET_ESCROW','VERIFICATION_HOLD') GROUP BY 1`,
    prisma.$queryRaw<{ count: number; stakes: bigint }[]>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(b.stake + COALESCE((SELECT SUM(c."stakePortion") FROM "Cashout" c WHERE c."betId" = b.id AND NOT c.full),0)),0)::bigint AS stakes
      FROM "Bet" b WHERE b."userId" IN (${S}) AND b."placedAt" >= ${from} AND b."placedAt" < ${to}`,
    prisma.$queryRaw<{ status: string; count: number; payout: bigint; stake: bigint; turnover: bigint }[]>`
      SELECT b.status::text, COUNT(*)::int AS count, COALESCE(SUM(b."potentialPayout"),0)::bigint AS payout, COALESCE(SUM(b.stake),0)::bigint AS stake,
        COALESCE(SUM(b.stake + COALESCE((SELECT SUM(c."stakePortion") FROM "Cashout" c WHERE c."betId" = b.id AND NOT c.full),0)),0)::bigint AS turnover
      FROM "Bet" b WHERE b."userId" IN (${S}) AND b."settledAt" >= ${from} AND b."settledAt" < ${to} GROUP BY 1`,
    prisma.$queryRaw<{ count: number; paid: bigint }[]>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(c.amount),0)::bigint AS paid FROM "Cashout" c JOIN "Bet" b ON b.id = c."betId"
      WHERE b."userId" IN (${S}) AND c."createdAt" >= ${from} AND c."createdAt" < ${to}`,
    prisma.$queryRaw<{ count: number; stakes: bigint }[]>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(b.stake),0)::bigint AS stakes FROM "Bet" b WHERE b."userId" IN (${S}) AND b.status = 'PENDING'`,
    prisma.$queryRaw<{ kind: string; ggr: bigint }[]>`
      SELECT t.kind, COALESCE(SUM(e.amount),0)::bigint AS ggr FROM "LedgerEntry" e
      JOIN "LedgerAccount" a ON a.id = e."accountId" AND a.kind = 'HOUSE_PNL'
      JOIN "LedgerTransaction" t ON t.id = e."transactionId"
      WHERE t.kind IN ${BETTING_KINDS} AND t."createdAt" >= ${from} AND t."createdAt" < ${to}
        AND (${scope.kind === "all"} OR t.reference IN (
          SELECT 'bet_settle:' || b.id FROM "Bet" b WHERE b."userId" IN (${S})
          UNION ALL SELECT 'cashout:' || c."idempotencyKey" FROM "Cashout" c JOIN "Bet" b ON b.id = c."betId" WHERE b."userId" IN (${S})))
      GROUP BY t.kind`,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(e.amount),0)::bigint AS total FROM "LedgerEntry" e
      JOIN "LedgerAccount" a ON a.id = e."accountId" AND a.kind = 'USER_CASH'
      JOIN "LedgerTransaction" t ON t.id = e."transactionId"
      WHERE t.kind = 'ADMIN_ADJUSTMENT' AND a."userId" IN (${S}) AND t."createdAt" >= ${from} AND t."createdAt" < ${to}`,
  ]);

  const p = players[0]!;
  const sumPay = (pred: (r: (typeof pay)[number]) => boolean) =>
    pay.filter(pred).reduce((acc, r) => ({ count: acc.count + r.count, total: acc.total + n(r.total) }), { count: 0, total: 0n });
  const liabOf = (k: string) => n(liab.find((r) => r.kind === k)?.total ?? 0n);
  const st = (s: string) => settled.find((r) => r.status === s);
  const cashL = liabOf("USER_CASH");
  const escrow = liabOf("BET_ESCROW");
  const held = liabOf("VERIFICATION_HOLD");
  const ggrOf = (k: string) => n(ggr.find((r) => r.kind === k)?.ggr ?? 0n);
  const ggrV = ggr.reduce((acc, r) => acc + n(r.ggr), 0n);

  return {
    players: { total: p.total, newInRange: p.fresh, verified: p.verified, suspended: p.suspended, activeBettors: p.bettors, depositors: p.depositors },
    money: {
      deposits: sumPay((r) => r.direction === "DEPOSIT" && r.status === "SUCCEEDED" && !r.verification),
      withdrawals: sumPay((r) => r.direction === "WITHDRAWAL" && r.status === "SUCCEEDED"),
      verificationPayments: sumPay((r) => r.direction === "DEPOSIT" && r.status === "SUCCEEDED" && r.verification),
      pending: sumPay((r) => r.status === "PENDING"),
      failed: sumPay((r) => r.status === "FAILED" || r.status === "CANCELLED"),
      liabilities: { cash: cashL, escrow, held, total: cashL + escrow + held },
    },
    betting: {
      placed: { count: placed[0]!.count, stakes: n(placed[0]!.stakes) },
      won: { count: st("WON")?.count ?? 0, paid: n(st("WON")?.payout ?? 0n) },
      lost: { count: st("LOST")?.count ?? 0, stakes: n(st("LOST")?.stake ?? 0n) },
      void: { count: st("VOID")?.count ?? 0, refunded: n(st("VOID")?.payout ?? 0n) },
      cashouts: { count: cash[0]!.count, paid: n(cash[0]!.paid) },
      open: { count: open[0]!.count, stakes: n(open[0]!.stakes) },
    },
    revenue: {
      ggr: ggrV,
      bonuses: 0n,
      ngr: ggrV,
      adjustments: n(adj[0]?.total),
      settledTurnover: settled.reduce((acc, r) => acc + n(r.turnover), 0n),
      // Ledger GGR by source; these sum exactly to ggr.
      bySource: { lost: ggrOf("BET_LOSS"), won: ggrOf("BET_PAYOUT"), cashout: ggrOf("CASHOUT"), void: ggrOf("VOID_REFUND") },
    },
  };
}

/** The period of equal length just before this one (for change figures); none for "all time". */
export function previousRange(r: Range): Range | null {
  if (r.key === "all") return null;
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: r.from, key: `prev-${r.key}` };
}

/** Where betting happened: selections and distinct bets per competition, for bets placed in the range. */
export async function competitionActivity(scope: Scope, range: Range, take = 8) {
  const S = scoped(scope);
  return prisma.$queryRaw<{ id: string; name: string; badgeUrl: string | null; legs: number; bets: number }[]>`
    SELECT c.id, COALESCE(c."displayName", c.name) AS name, c."badgeUrl", COUNT(*)::int AS legs, COUNT(DISTINCT bs."betId")::int AS bets
    FROM "BetSelection" bs JOIN "Bet" b ON b.id = bs."betId" JOIN "Fixture" f ON f.id = bs."fixtureId" JOIN "Competition" c ON c.id = f."competitionId"
    WHERE b."userId" IN (${S}) AND b."placedAt" >= ${range.from} AND b."placedAt" < ${range.to}
    GROUP BY c.id, c."displayName", c.name, c."badgeUrl" ORDER BY legs DESC LIMIT ${take}`;
}

export interface SeriesPoint {
  bucket: string; // YYYY-MM-DD (start of the day or week)
  registrations: number;
  deposits: bigint;
  withdrawals: bigint;
  stakes: bigint;
  ggr: bigint;
}

/** Daily figures (weekly beyond ~4 months) across the range, for charts. */
export async function scopeSeries(scope: Scope, range: Range): Promise<SeriesPoint[]> {
  const S = scoped(scope);
  const { to } = range;
  // "All time" starts at the first real activity, not in 2000.
  let from = range.from;
  if (range.key === "all") {
    const first = await prisma.$queryRaw<{ d: Date | null }[]>`SELECT MIN("createdAt") AS d FROM "User" WHERE id IN (${S})`;
    if (first[0]?.d) from = startOfUtcDay(first[0].d);
  }
  const unit = to.getTime() - from.getTime() > 125 * DAY ? "week" : "day";
  const U = Prisma.raw(`'${unit}'`);
  const rows = await prisma.$queryRaw<{ bucket: Date; registrations: number; deposits: bigint; withdrawals: bigint; stakes: bigint; ggr: bigint }[]>`
    WITH buckets AS (
      SELECT generate_series(date_trunc(${U}, ${from}::timestamp), date_trunc(${U}, ${to}::timestamp - interval '1 second'), ('1 ' || ${U})::interval) AS bucket
    )
    SELECT bk.bucket,
      (SELECT COUNT(*)::int FROM "User" u WHERE u.id IN (${S}) AND date_trunc(${U}, u."createdAt") = bk.bucket) AS registrations,
      (SELECT COALESCE(SUM(p.amount),0)::bigint FROM "PaymentIntent" p WHERE p."userId" IN (${S}) AND p.direction = 'DEPOSIT' AND p.status = 'SUCCEEDED'
         AND COALESCE(p.metadata->>'purpose','') <> 'VERIFICATION' AND date_trunc(${U}, p."createdAt") = bk.bucket) AS deposits,
      (SELECT COALESCE(SUM(p.amount),0)::bigint FROM "PaymentIntent" p WHERE p."userId" IN (${S}) AND p.direction = 'WITHDRAWAL' AND p.status = 'SUCCEEDED'
         AND date_trunc(${U}, p."createdAt") = bk.bucket) AS withdrawals,
      (SELECT COALESCE(SUM(b.stake + COALESCE((SELECT SUM(c."stakePortion") FROM "Cashout" c WHERE c."betId" = b.id AND NOT c.full),0)),0)::bigint
         FROM "Bet" b WHERE b."userId" IN (${S}) AND date_trunc(${U}, b."placedAt") = bk.bucket) AS stakes,
      (SELECT COALESCE(SUM(e.amount),0)::bigint FROM "LedgerEntry" e
         JOIN "LedgerAccount" a ON a.id = e."accountId" AND a.kind = 'HOUSE_PNL'
         JOIN "LedgerTransaction" t ON t.id = e."transactionId"
         WHERE t.kind IN ${BETTING_KINDS} AND date_trunc(${U}, t."createdAt") = bk.bucket
           AND (${scope.kind === "all"} OR t.reference IN (
             SELECT 'bet_settle:' || b.id FROM "Bet" b WHERE b."userId" IN (${S})
             UNION ALL SELECT 'cashout:' || c."idempotencyKey" FROM "Cashout" c JOIN "Bet" b ON b.id = c."betId" WHERE b."userId" IN (${S})))) AS ggr
    FROM buckets bk ORDER BY bk.bucket`;
  return rows.map((r) => ({
    bucket: r.bucket.toISOString().slice(0, 10),
    registrations: r.registrations,
    deposits: n(r.deposits),
    withdrawals: n(r.withdrawals),
    stakes: n(r.stakes),
    ggr: n(r.ggr),
  }));
}

/** Every administrator with their referral network's figures for the range. */
export async function adminComparison(range: Range) {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, displayName: true, adminUsername: true, role: true, status: true, referralCode: true, lastLoginAt: true, adminRole: { select: { name: true } } },
  });
  return Promise.all(admins.map(async (a) => ({ ...a, metrics: await scopeMetrics({ kind: "referrer", adminId: a.id }, range) })));
}

/** Players by stake placed in the range. */
export async function topPlayers(scope: Scope, range: Range, take = 8) {
  const S = scoped(scope);
  return prisma.$queryRaw<{ id: string; email: string; bets: number; stakes: bigint }[]>`
    SELECT u.id, u.email, COUNT(b.id)::int AS bets, COALESCE(SUM(b.stake),0)::bigint AS stakes
    FROM "Bet" b JOIN "User" u ON u.id = b."userId"
    WHERE b."userId" IN (${S}) AND b."placedAt" >= ${range.from} AND b."placedAt" < ${range.to}
    GROUP BY u.id, u.email ORDER BY stakes DESC LIMIT ${take}`;
}

export interface ActivityItem {
  at: Date;
  kind: "registration" | "bet" | "payment" | "admin";
  text: string;
  href?: string;
}

/** Latest registrations, bets and payments in scope, plus admin actions when allowed. */
/** Audit actions as a person would say them; anything new falls back to its own name. */
const ACTION_TEXT: Record<string, string> = {
  GENERATE_FIXTURE: "generated a match",
  CREATE_MANUAL_FIXTURE: "added a manual game",
  RESCHEDULE_FIXTURE: "moved a kick-off time",
  LIVE_SCORE_FIXTURE: "updated a live score",
  SETTLE_FIXTURE: "settled a match",
  VOID_FIXTURE: "voided a match",
  APPROVE_VERIFICATION: "approved a verification",
  REJECT_VERIFICATION: "rejected a verification",
  PAYOUT_MARKED_PAID: "paid a withdrawal",
  PAYOUT_MARKED_FAILED: "returned a withdrawal",
  BALANCE_ADJUSTMENT: "corrected a balance",
  PLAYER_SUSPEND: "suspended a player",
  PLAYER_REACTIVATE: "reactivated a player",
  ADMIN_CREATE: "added an administrator",
  ADMIN_SUSPEND: "suspended an administrator",
  ADMIN_REACTIVATE: "reactivated an administrator",
  ADMIN_ACCESS_CHANGE: "changed an administrator's access",
  ADMIN_PROFILE_CHANGE: "edited an administrator's profile",
  ADMIN_RESET_LINK: "sent a password reset link",
  ADMIN_SETUP_COMPLETE: "finished setting up their account",
  PASSWORD_RESET_REQUEST: "asked for a password reset",
  PASSWORD_RESET_COMPLETE: "reset their password",
  EMAIL_VERIFIED: "confirmed their email",
  REPORT_EXPORT: "exported a report",
  ROLE_CREATE: "created a role",
  ROLE_UPDATE: "updated a role",
  ROLE_DELETE: "deleted a role",
  UPDATE_RG_LIMITS: "changed their betting limits",
};
const actionText = (a: string) => ACTION_TEXT[a] ?? a.toLowerCase().replace(/_/g, " ");

export async function recentActivity(scope: Scope, withAudit: boolean, take = 20): Promise<ActivityItem[]> {
  const userWhere =
    scope.kind === "all" ? { role: "USER" as const } : scope.kind === "player" ? { role: "USER" as const, id: scope.userId } : { role: "USER" as const, referredById: scope.adminId };
  const [regs, bets, pays, logs] = await Promise.all([
    prisma.user.findMany({ where: userWhere, orderBy: { createdAt: "desc" }, take, select: { id: true, email: true, createdAt: true, referralSource: true } }),
    prisma.bet.findMany({ where: { user: userWhere }, orderBy: { placedAt: "desc" }, take, select: { ref: true, stake: true, placedAt: true, userId: true, user: { select: { email: true } } } }),
    prisma.paymentIntent.findMany({ where: { user: userWhere }, orderBy: { createdAt: "desc" }, take, select: { ref: true, direction: true, status: true, amount: true, createdAt: true, userId: true, user: { select: { email: true } } } }),
    withAudit ? prisma.auditLog.findMany({ orderBy: { seq: "desc" }, take, select: { action: true, createdAt: true, targetType: true, actor: { select: { email: true } } } }) : Promise.resolve([]),
  ]);
  const ghs = (p: bigint) => `GHS ${(Number(p) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const items: ActivityItem[] = [
    ...regs.map((u) => ({ at: u.createdAt, kind: "registration" as const, text: `${u.email} registered${u.referralSource ? ` (${u.referralSource === "LINK" ? "referral link" : "referral code"})` : ""}`, href: `/admin/users/${u.id}` })),
    ...bets.map((b) => ({ at: b.placedAt, kind: "bet" as const, text: `${b.user.email} placed ${b.ref} · ${ghs(b.stake)}`, href: `/admin/users/${b.userId}` })),
    ...pays.map((p) => ({ at: p.createdAt, kind: "payment" as const, text: `${p.user.email} ${p.direction === "DEPOSIT" ? "deposit" : "withdrawal"} ${ghs(p.amount)} · ${p.status.toLowerCase()}`, href: `/admin/users/${p.userId}` })),
    ...logs.map((l) => ({ at: l.createdAt, kind: "admin" as const, text: `${l.actor?.email ?? "system"} ${actionText(l.action)}`, href: "/admin/audit" })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

/** Referral funnel for one admin: sign-ups by period, conversion to depositors and repeat depositors, recent activity. */
export async function referralFunnel(adminId: string) {
  const now = Date.now();
  const today = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()));
  const rows = await prisma.$queryRaw<{ today: number; week: number; month: number; lifetime: number; depositors: number; repeat: number; bettors30: number }[]>`
    WITH mine AS (SELECT id, "createdAt" FROM "User" WHERE role = 'USER' AND "referredById" = ${adminId}),
    deps AS (
      SELECT p."userId", COUNT(*) AS n FROM "PaymentIntent" p
      WHERE p."userId" IN (SELECT id FROM mine) AND p.direction = 'DEPOSIT' AND p.status = 'SUCCEEDED' AND COALESCE(p.metadata->>'purpose','') <> 'VERIFICATION'
      GROUP BY p."userId")
    SELECT
      (SELECT COUNT(*)::int FROM mine WHERE "createdAt" >= ${today}) AS today,
      (SELECT COUNT(*)::int FROM mine WHERE "createdAt" >= ${new Date(now - 7 * DAY)}) AS week,
      (SELECT COUNT(*)::int FROM mine WHERE "createdAt" >= ${new Date(now - 30 * DAY)}) AS month,
      (SELECT COUNT(*)::int FROM mine) AS lifetime,
      (SELECT COUNT(*)::int FROM deps) AS depositors,
      (SELECT COUNT(*)::int FROM deps WHERE n >= 2) AS repeat,
      (SELECT COUNT(DISTINCT b."userId")::int FROM "Bet" b WHERE b."userId" IN (SELECT id FROM mine) AND b."placedAt" >= ${new Date(now - 30 * DAY)}) AS bettors30`;
  return rows[0]!;
}
