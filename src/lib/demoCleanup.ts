/**
 * Clearing the demo data left over from building and testing, keeping real money.
 *
 * Real money = a SUCCEEDED ShinobiPay deposit; nothing else is proof. Demo money = every other payment
 * (sandbox, other providers), every admin balance adjustment, plus everything done by players without a
 * real deposit (their bets, cash outs, verification releases). That fake money is removed from whoever
 * holds it, real sign-up or not. A player with a real deposit keeps every bet; only their non-ShinobiPay money goes.
 * Demo accounts = only the ones built for testing, recognised by their address. Somebody who signed
 * up for real and never deposited keeps their account; they just lose the fake money.
 * A real payment (any live provider) and the ledger behind it is never touched.
 *
 * Guarantees, enforced inside one transaction that rolls back if either fails:
 *  - the ledger still sums to zero (transactions are deleted whole, never one side);
 *  - no surviving balance goes negative (which would mean money was taken off someone);
 *  - every real payment keeps its ledger transaction, so real money is never touched.
 * The plan also prints each kept player's resulting balance beside their real-payment total, so
 * anything that still looks like demo money is visible before you confirm.
 * The audit trail is append-only by design and is never touched, so an account that appears in it
 * is closed rather than deleted.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Addresses only ever used for testing. A real sign-up never matches, so it is never removed. */
const TEST_ACCOUNT = /@(example\.test|t\.gh|test\.gh)$|^(verifytest|refplayer|partner\.e2e|local\.tester|demo@)|^(gggg|ron)@gmail\.com$/i; // last two: the owner's own test sign-ups on live
export const isTestAccount = (email: string) => TEST_ACCOUNT.test(email);

/** The only payment provider whose deposits count as real money. */
const REAL_PROVIDER = "shinobipay";

export interface CleanupPlan {
  realPayments: { provider: string; direction: string; status: string; amount: bigint; email: string }[];
  keptPlayers: { email: string; balanceAfter: bigint; realPaymentsTotal: bigint }[];
  keptStaff: string[];
  keptPlayersWithoutDeposits: string[];
  removedAdjustments: { email: string; amount: bigint }[];
  /** ShinobiPay payments by players with no successful deposit: kept (they are the provider's record), shown for review. */
  unprovenShinobi: { direction: string; status: string; amount: bigint; email: string }[];
  /** Commission payouts recorded to admins (outside the ledger): shown for review, not removed. */
  commissionPayouts: { email: string; amount: bigint }[];
  demoPayments: { count: number; total: bigint };
  bets: { remove: number; keep: number };
  ledger: { remove: number; keep: number };
  deleteAccounts: string[];
  closeAccounts: string[];
  manualFixtures: number;
  sandboxWebhooks: number;
}

/** Generated/manual games with no bet left on them except demo ones. A game a real bet stands on stays. */
const demoFixtures = (demoBetIds: string[]): Prisma.FixtureWhereInput => ({ providerRef: null, betSelections: { none: { betId: { notIn: demoBetIds } } } });

interface Doomed {
  plan: CleanupPlan;
  txIds: string[];
  demoBetIds: string[];
  demoUserIds: string[];
  deleteIds: string[];
  closeIds: string[];
  realPays: { ref: string; userId: string; direction: string; status: string; amount: bigint }[];
}

async function assess(): Promise<Doomed> {
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, status: true } });
  const pays = await prisma.paymentIntent.findMany({ select: { ref: true, userId: true, provider: true, direction: true, status: true, amount: true } });
  const bets = await prisma.bet.findMany({ select: { id: true, userId: true } });
  const email = (id: string) => users.find((u) => u.id === id)?.email ?? id;

  const realPays = pays.filter((p) => p.provider === REAL_PROVIDER);
  const demoPays = pays.filter((p) => p.provider !== REAL_PROVIDER);
  const realPlayers = new Set(realPays.filter((p) => p.direction === "DEPOSIT" && p.status === "SUCCEEDED").map((p) => p.userId));
  // Only test accounts go. Never a super admin, and never anyone who has put real money in.
  const demoUsers = users.filter((u) => isTestAccount(u.email) && u.role !== "SUPER_ADMIN" && !realPlayers.has(u.id));
  const demoUserIds = new Set(demoUsers.map((u) => u.id));
  const staff = users.filter((u) => u.role !== "USER" && !demoUserIds.has(u.id));

  // Somebody who never put real money in only ever played with demo money: all their bets, cash outs and
  // verification releases go. A real player keeps every bet; only their sandbox payments go.
  const noRealMoney = new Set(users.filter((u) => !realPlayers.has(u.id)).map((u) => u.id));
  const demoBets = bets.filter((b) => noRealMoney.has(b.userId));

  // Every ledger transaction that touches a demo account or a player with no real money, came from a
  // non-ShinobiPay payment, or is an admin balance adjustment (money that never came through ShinobiPay).
  const entries = await prisma.ledgerEntry.findMany({ select: { transactionId: true, amount: true, account: { select: { userId: true, kind: true } } } });
  const touching = (ids: Set<string>) => new Set(entries.filter((e) => e.account.userId && ids.has(e.account.userId)).map((e) => e.transactionId));
  const byDemoAccount = touching(demoUserIds);
  const byNoRealMoney = touching(noRealMoney);
  const demoRefs = new Set(demoPays.flatMap((p) => [`deposit:${p.ref}`, `wdr_hold:${p.ref}`, `wdr_reverse:${p.ref}`, `manual:${p.ref}`, `refused:${p.ref}`]));
  const txs = await prisma.ledgerTransaction.findMany({ select: { id: true, reference: true, kind: true } });
  const doomed = txs.filter((t) => byDemoAccount.has(t.id) || demoRefs.has(t.reference) || byNoRealMoney.has(t.id) || t.kind === "ADMIN_ADJUSTMENT");
  const removedAdjustments = txs
    .filter((t) => t.kind === "ADMIN_ADJUSTMENT")
    .flatMap((t) => entries.filter((e) => e.transactionId === t.id && e.account.userId).map((e) => ({ email: email(e.account.userId!), amount: e.amount })));
  const doomedIds = new Set(doomed.map((t) => t.id));
  const removedCash = (userId: string) =>
    entries.filter((e) => e.account.userId === userId && e.account.kind === "USER_CASH" && doomedIds.has(e.transactionId)).reduce((n, e) => n + e.amount, 0n);

  // The audit trail refuses edits, so an account named in it can only be closed.
  const balances = new Map(
    (
      await prisma.$queryRaw<{ userId: string; bal: bigint }[]>`
        SELECT a."userId", COALESCE(SUM(e.amount),0)::bigint AS bal FROM "LedgerAccount" a
        LEFT JOIN "LedgerEntry" e ON e."accountId" = a.id WHERE a.kind = 'USER_CASH' AND a."userId" IS NOT NULL GROUP BY a."userId"`
    ).map((r) => [r.userId, r.bal] as const),
  );

  const actors = new Set((await prisma.auditLog.findMany({ where: { actorUserId: { not: null } }, select: { actorUserId: true }, distinct: ["actorUserId"] })).map((a) => a.actorUserId!));
  const toDelete = demoUsers.filter((u) => !actors.has(u.id));
  const toClose = demoUsers.filter((u) => actors.has(u.id) && u.status !== "CLOSED");

  return {
    txIds: doomed.map((t) => t.id),
    demoBetIds: demoBets.map((b) => b.id),
    demoUserIds: [...demoUserIds],
    deleteIds: toDelete.map((u) => u.id),
    closeIds: toClose.map((u) => u.id),
    realPays: realPays.map((p) => ({ ref: p.ref, userId: p.userId, direction: p.direction, status: p.status, amount: p.amount })),
    plan: {
      realPayments: realPays.map((p) => ({ provider: p.provider, direction: p.direction, status: p.status, amount: p.amount, email: email(p.userId) })),
      keptPlayers: users
        .filter((u) => realPlayers.has(u.id))
        .map((u) => ({
          email: u.email,
          balanceAfter: (balances.get(u.id) ?? 0n) - removedCash(u.id),
          realPaymentsTotal: realPays.filter((p) => p.userId === u.id && p.status === "SUCCEEDED").reduce((n, p) => n + (p.direction === "DEPOSIT" ? p.amount : -p.amount), 0n),
        })),
      keptStaff: staff.map((u) => u.email),
      keptPlayersWithoutDeposits: users.filter((u) => u.role === "USER" && !realPlayers.has(u.id) && !demoUserIds.has(u.id)).map((u) => u.email),
      removedAdjustments,
      unprovenShinobi: realPays.filter((p) => !realPlayers.has(p.userId)).map((p) => ({ direction: p.direction, status: p.status, amount: p.amount, email: email(p.userId) })),
      commissionPayouts: (await prisma.commissionPayout.findMany({ select: { adminId: true, amount: true } })).map((c) => ({ email: email(c.adminId), amount: c.amount })),
      demoPayments: { count: demoPays.length, total: demoPays.reduce((n, p) => n + p.amount, 0n) },
      bets: { remove: demoBets.length, keep: bets.length - demoBets.length },
      ledger: { remove: doomed.length, keep: txs.length - doomed.length },
      deleteAccounts: toDelete.map((u) => u.email),
      closeAccounts: toClose.map((u) => u.email),
      manualFixtures: await prisma.fixture.count({ where: demoFixtures(demoBets.map((b) => b.id)) }),
      sandboxWebhooks: await prisma.webhookEvent.count({ where: { provider: { not: REAL_PROVIDER } } }),
    },
  };
}

/** What a cleanup would remove. Reads only. */
export const planDemoCleanup = async (): Promise<CleanupPlan> => (await assess()).plan;

/** Do it. Throws (and changes nothing) if the books would not add up afterwards. */
export async function runDemoCleanup(): Promise<CleanupPlan> {
  const d = await assess();
  await prisma.$transaction(
    async (tx) => {
      await tx.ledgerEntry.deleteMany({ where: { transactionId: { in: d.txIds } } });
      await tx.ledgerTransaction.deleteMany({ where: { id: { in: d.txIds } } });
      await tx.bet.deleteMany({ where: { id: { in: d.demoBetIds } } }); // their selections and cash outs cascade
      await tx.paymentIntent.deleteMany({ where: { provider: { not: REAL_PROVIDER } } });
      await tx.webhookEvent.deleteMany({ where: { provider: { not: REAL_PROVIDER } } });
      await tx.fixture.deleteMany({ where: demoFixtures(d.demoBetIds) });
      await tx.ledgerAccount.deleteMany({ where: { userId: { in: d.demoUserIds } } });
      await tx.user.updateMany({ where: { id: { in: d.closeIds } }, data: { status: "CLOSED" } });
      await tx.user.deleteMany({ where: { id: { in: d.deleteIds } } });

      const totals = await tx.$queryRaw<{ total: bigint }[]>`SELECT COALESCE(SUM(amount),0)::bigint AS total FROM "LedgerEntry"`;
      const total = totals[0]?.total ?? 0n;
      if (total !== 0n) throw new Error(`ledger would no longer balance (${total})`);

      const left = await tx.$queryRaw<{ userId: string; bal: bigint }[]>`
        SELECT a."userId", COALESCE(SUM(e.amount),0)::bigint AS bal FROM "LedgerAccount" a
        LEFT JOIN "LedgerEntry" e ON e."accountId" = a.id WHERE a.kind = 'USER_CASH' AND a."userId" IS NOT NULL GROUP BY a."userId"`;
      const negative = left.find((r) => r.bal < 0n);
      if (negative) throw new Error(`a player would be left owing money (${negative.bal}) — their stake came from demo funds`);

      // Real money is never touched: every real payment keeps the ledger transaction behind it.
      const keptRefs = new Set((await tx.ledgerTransaction.findMany({ select: { reference: true } })).map((t) => t.reference));
      const lost = d.realPays.find((p) => p.status === "SUCCEEDED" && !keptRefs.has(p.direction === "DEPOSIT" ? `deposit:${p.ref}` : `wdr_hold:${p.ref}`));
      if (lost) throw new Error(`a real payment (${lost.ref}) would lose its ledger entries`);
    },
    { timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return d.plan;
}
