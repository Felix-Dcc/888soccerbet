/**
 * Admin commission. An admin earns their rate (basis points: 100 = 1%) on the net deposits
 * (successful deposits plus withdrawal-verification fees (KYC/NTT), minus successful withdrawals)
 * of the players who signed up with their referral code or link. Verification fees count like
 * deposits: they end up in the player's balance either way, and withdrawing them counts against net. Earnings use
 * the current rate, so changing a rate changes what was earned. Never below zero. Payouts are
 * paid outside the site and recorded here by a super admin; owed = earned - paid.
 */
import { Prisma, type User } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { AdminError } from "./admins";

type Db = Prisma.TransactionClient | typeof prisma;
type Span = { from: Date; to: Date };

export const MAX_BP = 10_000;
export const LIFETIME: Span = { from: new Date("2000-01-01T00:00:00Z"), to: new Date("2100-01-01T00:00:00Z") };

/** Commission on a net amount (pesewas), rounded down; nothing on a net loss. */
export const commissionOf = (net: bigint, bp: number) => (net > 0n ? (net * BigInt(bp)) / 10_000n : 0n);

export interface Figures {
  signups: number;
  depositors: number;
  deposits: bigint;
  /** Withdrawal-verification (KYC/NTT) payments. */
  verification: bigint;
  withdrawals: bigint;
  net: bigint;
}
const EMPTY: Figures = { signups: 0, depositors: 0, deposits: 0n, verification: 0n, withdrawals: 0n, net: 0n };
const big = (v: unknown) => (typeof v === "bigint" ? v : BigInt((v as number | string | null) ?? 0));

/** Referral figures per admin in a span (sign-ups and payments by their creation time). */
async function figuresByAdmin(db: Db, span: Span, adminId?: string): Promise<Map<string, Figures>> {
  const only = adminId ? Prisma.sql`AND u."referredById" = ${adminId}` : Prisma.empty;
  const [signups, money] = await Promise.all([
    db.$queryRaw<{ admin: string; signups: number }[]>`
      SELECT u."referredById" AS admin, COUNT(*)::int AS signups FROM "User" u
      WHERE u.role = 'USER' AND u."referredById" IS NOT NULL ${only} AND u."createdAt" >= ${span.from} AND u."createdAt" < ${span.to}
      GROUP BY 1`,
    db.$queryRaw<{ admin: string; depositors: number; deposits: bigint; verification: bigint; withdrawals: bigint }[]>`
      SELECT u."referredById" AS admin,
        (COUNT(DISTINCT p."userId") FILTER (WHERE p.direction = 'DEPOSIT' AND COALESCE(p.metadata->>'purpose', '') NOT IN ('VERIFICATION', 'NTT')))::int AS depositors,
        COALESCE(SUM(p.amount) FILTER (WHERE p.direction = 'DEPOSIT' AND COALESCE(p.metadata->>'purpose', '') NOT IN ('VERIFICATION', 'NTT')), 0)::bigint AS deposits,
        COALESCE(SUM(p.amount) FILTER (WHERE p.direction = 'DEPOSIT' AND COALESCE(p.metadata->>'purpose', '') IN ('VERIFICATION', 'NTT')), 0)::bigint AS verification,
        COALESCE(SUM(p.amount) FILTER (WHERE p.direction = 'WITHDRAWAL'), 0)::bigint AS withdrawals
      FROM "PaymentIntent" p JOIN "User" u ON u.id = p."userId"
      WHERE u.role = 'USER' AND u."referredById" IS NOT NULL ${only} AND p.status = 'SUCCEEDED'
        AND COALESCE(p."settledAt", p."createdAt") >= ${span.from} AND COALESCE(p."settledAt", p."createdAt") < ${span.to}
      GROUP BY 1`,
  ]);
  const out = new Map<string, Figures>();
  const get = (id: string) => {
    let f = out.get(id);
    if (!f) out.set(id, (f = { ...EMPTY }));
    return f;
  };
  for (const r of signups) get(r.admin).signups = r.signups;
  for (const r of money) {
    const f = get(r.admin);
    f.depositors = r.depositors;
    f.deposits = big(r.deposits);
    f.verification = big(r.verification);
    f.withdrawals = big(r.withdrawals);
  }
  for (const f of out.values()) f.net = f.deposits + f.verification - f.withdrawals;
  return out;
}

async function defaultBp(db: Db) {
  return (await db.platformSettings.findUnique({ where: { id: "singleton" }, select: { defaultCommissionBp: true } }))?.defaultCommissionBp ?? 0;
}

async function paidByAdmin(db: Db, adminId?: string) {
  const rows = await db.commissionPayout.groupBy({ by: ["adminId"], where: adminId ? { adminId } : {}, _sum: { amount: true } });
  return new Map(rows.map((r) => [r.adminId, r._sum.amount ?? 0n]));
}

/** One admin's own commission: their rate, the range figures, lifetime earnings and payouts. */
export async function myCommission(adminId: string, range: Span) {
  const [user, dflt, inRange, life, paid, payouts] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { referralCode: true, commissionBp: true } }),
    defaultBp(prisma),
    figuresByAdmin(prisma, range, adminId),
    figuresByAdmin(prisma, LIFETIME, adminId),
    paidByAdmin(prisma, adminId),
    prisma.commissionPayout.findMany({ where: { adminId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const bp = user.commissionBp ?? dflt;
  const r = inRange.get(adminId) ?? EMPTY;
  const l = life.get(adminId) ?? EMPTY;
  const earned = commissionOf(l.net, bp);
  const paidSum = paid.get(adminId) ?? 0n;
  return {
    code: user.referralCode,
    bp,
    isDefault: user.commissionBp === null,
    range: { ...r, commission: commissionOf(r.net, bp) },
    lifetime: { ...l, earned, paid: paidSum, owed: earned > paidSum ? earned - paidSum : 0n },
    payouts,
  };
}

/** Every admin's lifetime commission, for super admins. Removed admins stay listed only while they earned or were paid something. */
export async function commissionOverview() {
  const [admins, dflt, life, paid] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, displayName: true, referralCode: true, status: true, commissionBp: true },
    }),
    defaultBp(prisma),
    figuresByAdmin(prisma, LIFETIME),
    paidByAdmin(prisma),
  ]);
  const rows = admins
    .map((a) => {
      const f = life.get(a.id) ?? EMPTY;
      const bp = a.commissionBp ?? dflt;
      const earned = commissionOf(f.net, bp);
      const paidSum = paid.get(a.id) ?? 0n;
      return { ...a, bp, isDefault: a.commissionBp === null, ...f, earned, paid: paidSum, owed: earned > paidSum ? earned - paidSum : 0n };
    })
    .filter((a) => a.status !== "CLOSED" || a.earned > 0n || a.paid > 0n);
  const sum = (k: "net" | "earned" | "paid" | "owed") => rows.reduce((n, a) => n + a[k], 0n);
  return { defaultBp: dflt, rows, totals: { net: sum("net"), earned: sum("earned"), paid: sum("paid"), owed: sum("owed") } };
}

const checkBp = (bp: number) => {
  if (!Number.isInteger(bp) || bp < 0 || bp > MAX_BP) throw new AdminError("BAD_RATE", "Enter a rate from 0% to 100%, up to 2 decimal places", 422);
};

export async function setDefaultRate(actor: User, bp: number, ip?: string) {
  checkBp(bp);
  const before = await defaultBp(prisma);
  const { updatePlatformSettings } = await import("./platformSettings"); // server-only; keeps this module importable in tests
  await updatePlatformSettings({ defaultCommissionBp: bp });
  await audit({ actorUserId: actor.id, action: "COMMISSION_DEFAULT_RATE", targetType: "PlatformSettings", targetId: "singleton", before: { bp: before }, after: { bp }, ip });
}

/** Give an admin their own rate, or null to put them back on the default. */
export async function setAdminRate(actor: User, adminId: string, bp: number | null, ip?: string) {
  if (bp !== null) checkBp(bp);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${adminId} FOR UPDATE`;
    const a = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, status: true, commissionBp: true } });
    if (!a || (a.role !== "ADMIN" && a.role !== "SUPER_ADMIN")) throw new AdminError("NOT_FOUND", "Administrator not found", 404);
    if (a.status === "CLOSED") throw new AdminError("REMOVED", "This administrator has been removed", 410);
    await tx.user.update({ where: { id: adminId }, data: { commissionBp: bp } });
    await audit({ actorUserId: actor.id, action: "COMMISSION_RATE", targetType: "User", targetId: adminId, before: { bp: a.commissionBp }, after: { bp }, ip }, tx);
  });
}

/** Record a commission payment made to an admin: at most what they are owed. Idempotent on key. */
export async function recordPayout(actor: User, adminId: string, amount: bigint, note: string | null, idempotencyKey: string, ip?: string) {
  if (amount <= 0n) throw new AdminError("BAD_AMOUNT", "Enter an amount above zero", 422);
  try {
    return await prisma.$transaction(async (tx) => {
      const done = await tx.commissionPayout.findUnique({ where: { idempotencyKey } });
      if (done) return { repeated: true };
      // Locks the admin, so two payouts (or a rate change) for them can't interleave and overpay.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${adminId} FOR UPDATE`;
      const a = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, commissionBp: true } });
      if (!a || (a.role !== "ADMIN" && a.role !== "SUPER_ADMIN")) throw new AdminError("NOT_FOUND", "Administrator not found", 404);
      const bp = a.commissionBp ?? (await defaultBp(tx));
      const f = (await figuresByAdmin(tx, LIFETIME, adminId)).get(adminId) ?? EMPTY;
      const earned = commissionOf(f.net, bp);
      const paid = (await paidByAdmin(tx, adminId)).get(adminId) ?? 0n;
      const owed = earned > paid ? earned - paid : 0n;
      if (amount > owed) throw new AdminError("OVERPAY", owed > 0n ? "That's more than they're owed" : "Nothing is owed to this admin", 422);
      const payout = await tx.commissionPayout.create({ data: { adminId, amount, note, idempotencyKey, createdById: actor.id } });
      await audit(
        { actorUserId: actor.id, action: "COMMISSION_PAYOUT", targetType: "User", targetId: adminId, before: { owed }, after: { owed: owed - amount }, metadata: { amount, note, payoutId: payout.id }, ip },
        tx,
      );
      return { repeated: false };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { repeated: true }; // a double-submit raced
    throw e;
  }
}
