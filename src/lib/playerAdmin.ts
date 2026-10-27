/**
 * What staff may do to player accounts. Balances are never edited: a correction is a balanced
 * ledger transaction (player cash vs the house P&L) with a written reason, an idempotency key and
 * before/after balances in the audit log. Settled bets are never altered here.
 */
import { Prisma, type User } from "@prisma/client";
import { prisma } from "./db";
import { accountBalance, houseAccountId, postTransaction, userAccountId } from "./ledger";
import { audit } from "./audit";
import { can, type StaffLike } from "./permissions";
import { AdminError } from "./admins";

/** Whether a staff member may open this player's profile. Server-side; the UI only mirrors it. */
export function canViewPlayer(staff: StaffLike & { id: string }, player: { referredById: string | null; referredByStaff?: boolean }) {
  if (can(staff, "users.view")) return true;
  if (can(staff, "referrals.view") && player.referredById === staff.id) return true;
  return can(staff, "referrals.view_all") && !!player.referredByStaff;
}

async function lockUser(tx: Prisma.TransactionClient, id: string, allow: readonly string[]) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
  const u = await tx.user.findUnique({ where: { id } });
  if (!u || !allow.includes(u.role)) throw new AdminError("NOT_FOUND", "Account not found", 404);
  return u;
}
const lockPlayer = (tx: Prisma.TransactionClient, id: string) => lockUser(tx, id, ["USER"]);

export async function setPlayerStatus(actor: User, playerId: string, status: "ACTIVE" | "SUSPENDED", reason: string, ip?: string) {
  return prisma.$transaction(async (tx) => {
    const p = await lockPlayer(tx, playerId);
    const after = await tx.user.update({ where: { id: playerId }, data: { status } });
    if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId: playerId } });
    await audit(
      { actorUserId: actor.id, action: status === "SUSPENDED" ? "PLAYER_SUSPEND" : "PLAYER_REACTIVATE", targetType: "User", targetId: playerId, before: { status: p.status }, after: { status: after.status }, metadata: { reason }, ip },
      tx,
    );
    return after;
  });
}

/** Credit (+) or debit (-) one account's cash with a traceable ledger adjustment (cash vs house P&L). Idempotent on key. */
async function postAdjustment(actor: User, userId: string, amount: bigint, reason: string, idempotencyKey: string, ip: string | undefined, allow: readonly string[]) {
  if (amount === 0n) throw new AdminError("BAD_AMOUNT", "Enter a non-zero amount", 422);
  const reference = `admin_adjust:${idempotencyKey}`;
  try {
    return await prisma.$transaction(async (tx) => {
      const done = await tx.ledgerTransaction.findUnique({ where: { reference } });
      if (done) return { reference, repeated: true };
      await lockUser(tx, userId, allow);
      const cashId = await userAccountId(tx, userId, "USER_CASH");
      await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${cashId} FOR UPDATE`;
      const before = await accountBalance(tx, cashId);
      if (before + amount < 0n) throw new AdminError("INSUFFICIENT_FUNDS", "That would make the balance negative", 422);
      const pnl = await houseAccountId(tx, "HOUSE_PNL");
      await postTransaction(tx, "ADMIN_ADJUSTMENT", reference, [
        { accountId: cashId, amount },
        { accountId: pnl, amount: -amount }, // the house bears a credit, recovers a debit
      ], { reason, actorUserId: actor.id });
      await audit(
        { actorUserId: actor.id, action: "BALANCE_ADJUSTMENT", targetType: "User", targetId: userId, before: { balance: before }, after: { balance: before + amount }, metadata: { amount, reason, reference }, ip },
        tx,
      );
      return { reference, repeated: false };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { reference, repeated: true }; // a double-submit raced
    throw e;
  }
}

/** Credit (+) or debit (-) a player's cash. Idempotent on key. */
export const adjustBalance = (actor: User, playerId: string, amount: bigint, reason: string, idempotencyKey: string, ip?: string) =>
  postAdjustment(actor, playerId, amount, reason, idempotencyKey, ip, ["USER"]);

/** Credit (+) or debit (-) an administrator's own cash balance (staff place bets too). Idempotent on key. */
export const adjustAdminBalance = (actor: User, adminId: string, amount: bigint, reason: string, idempotencyKey: string, ip?: string) =>
  postAdjustment(actor, adminId, amount, reason, idempotencyKey, ip, ["ADMIN", "SUPER_ADMIN"]);
