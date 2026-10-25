/**
 * Wallet. Deposits are NEVER credited from a frontend success — only from a verified,
 * idempotent provider webhook. Withdrawals hold funds immediately (so they cannot be
 * double-spent) and reverse on failure. All movements are balanced ledger transactions.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { accountBalance, postTransaction, userAccountId, houseAccountId, userCashBalance } from "./ledger";
import { formatPesewas, toPesewas } from "./money";
import { payRef } from "./ids";
import { paymentProvider } from "./providers/payments";
import type { NormalisedEvent } from "./providers/payments/types";
import { notifyPayment } from "./emailFlows";

export class WalletError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Smallest deposit accepted (MIN_DEPOSIT_GHS, default GHS 50). */
export const minDeposit = () => toPesewas(process.env.MIN_DEPOSIT_GHS ?? "50");

/**
 * Withdrawal verification. It applies only once a player has won a bet paying out more than
 * VERIFY_AFTER_WIN_GHS; until then they withdraw freely. From then on, before withdrawing, they make VERIFY_PAYMENTS separate
 * verification payments of VERIFY_DEPOSIT_GHS (default 2 x GHS 500) from the wallet's Verify
 * button — ordinary deposits never count. Each payment is HELD in the player's own
 * VERIFICATION_HOLD account (not spendable), and an admin then reviews:
 *  - approve -> the held money moves to the player's balance and withdrawals unlock (VERIFIED);
 *  - reject  -> the held money still moves to the player's balance (it is never kept by the
 *               site), withdrawals stay locked (REJECTED) and the player may verify again.
 * Progress is the held amount, so it can't be faked from the browser. Uses User.kycStatus:
 * PENDING = both payments made, awaiting review.
 */
export const VERIFY_PAYMENTS = 2;
/** Verification only applies once the player has won a bet paying out more than this (VERIFY_AFTER_WIN_GHS, default GHS 1000). */
export const verifyAfterWin = () => toPesewas(process.env.VERIFY_AFTER_WIN_GHS ?? "1000");

async function verificationRequired(db: Prisma.TransactionClient | typeof prisma, userId: string): Promise<boolean> {
  return !!(await db.bet.findFirst({ where: { userId, status: "WON", potentialPayout: { gt: verifyAfterWin() } }, select: { id: true } }));
}
export const verifyAmount = () => toPesewas(process.env.VERIFY_DEPOSIT_GHS ?? "500");

async function heldForVerification(db: Prisma.TransactionClient | typeof prisma, userId: string): Promise<{ id: string; held: bigint }> {
  const id = await userAccountId(db, userId, "VERIFICATION_HOLD");
  return { id, held: await accountBalance(db, id) };
}

export async function verificationState(userId: string) {
  const per = verifyAmount();
  const [{ held }, user, required] = await Promise.all([
    heldForVerification(prisma, userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } }),
    verificationRequired(prisma, userId),
  ]);
  const paid = Number(held / per) > VERIFY_PAYMENTS ? VERIFY_PAYMENTS : Number(held / per);
  return { required, paid, needed: VERIFY_PAYMENTS, perPayment: per, held, status: user.kycStatus };
}

/**
 * Responsible gambling on money in: no deposits while self-excluded, and none that would take
 * today's deposits (pending ones included, so it can't be dodged by starting several) over the
 * player's daily limit. The day runs midnight to midnight Accra time (UTC+0, no daylight saving).
 * shortcut: two deposits started at the same instant could both pass; lock the user row if limits get abused.
 */
async function checkDepositAllowed(userId: string, amount: bigint) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { selfExcludedUntil: true, dailyDepositLimit: true } });
  if (user.selfExcludedUntil && user.selfExcludedUntil > new Date()) throw new WalletError("SELF_EXCLUDED", "Self-exclusion is active on your account");
  if (user.dailyDepositLimit === null) return;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sum = await prisma.paymentIntent.aggregate({
    where: { userId, direction: "DEPOSIT", status: { in: ["PENDING", "SUCCEEDED"] }, createdAt: { gte: today } },
    _sum: { amount: true },
  });
  if ((sum._sum.amount ?? 0n) + amount > user.dailyDepositLimit)
    throw new WalletError("DEPOSIT_LIMIT", `That would go over your daily deposit limit of GHS ${formatPesewas(user.dailyDepositLimit)}`);
}

/** Shared by deposits and verification payments: one idempotent payment intent with the PSP. */
async function createDepositIntent(userId: string, amount: bigint, msisdn: string, idempotencyKey: string, purpose?: "VERIFICATION") {
  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  await checkDepositAllowed(userId, amount);

  const provider = paymentProvider();
  const ref = payRef(purpose ? "VER" : "DEP");
  const charge = await provider.initiate({ ref, amountPesewas: amount, msisdn, direction: "DEPOSIT" });
  try {
    return await prisma.paymentIntent.create({
      data: {
        ref,
        userId,
        direction: "DEPOSIT",
        amount,
        status: "PENDING",
        provider: provider.name,
        providerRef: charge.providerRef,
        idempotencyKey,
        metadata: purpose ? { msisdn, purpose } : { msisdn },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return prisma.paymentIntent.findUniqueOrThrow({ where: { idempotencyKey } });
    throw e;
  }
}

export async function initiateDeposit(userId: string, amountGhs: number, msisdn: string, idempotencyKey: string) {
  const amount = toPesewas(amountGhs);
  if (amount <= 0n) throw new WalletError("BAD_AMOUNT", "Amount must be positive");
  const min = minDeposit();
  if (amount < min) throw new WalletError("DEPOSIT_TOO_LOW", `Minimum deposit is GHS ${min / 100n}`);
  return createDepositIntent(userId, amount, msisdn, idempotencyKey);
}

/** One verification payment (fixed amount). Refused once verified or while both are awaiting review. */
export async function initiateVerificationPayment(userId: string, msisdn: string, idempotencyKey: string) {
  const v = await verificationState(userId);
  if (v.status === "VERIFIED") throw new WalletError("ALREADY_VERIFIED", "Your account is already verified");
  if (!v.required && v.held === 0n) throw new WalletError("NOT_REQUIRED", "Verification isn't needed yet — you can withdraw");
  if (v.paid >= v.needed) throw new WalletError("AWAITING_REVIEW", "Both verification payments are in — awaiting review");
  return createDepositIntent(userId, v.perPayment, msisdn, idempotencyKey, "VERIFICATION");
}

/** Admin decision on a player's verification. Either way the held money goes to their balance. */
export async function reviewVerification(userId: string, approve: boolean): Promise<{ released: bigint }> {
  return prisma.$transaction(async (tx) => {
    const { id: holdId } = await heldForVerification(tx, userId);
    await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${holdId} FOR UPDATE`;
    const held = await accountBalance(tx, holdId);
    const complete = held >= verifyAmount() * BigInt(VERIFY_PAYMENTS);
    if (approve && !complete) throw new WalletError("NOT_READY", "Both verification payments must be in before approval");
    if (!approve && held === 0n) throw new WalletError("NOTHING_HELD", "No verification payments to review");
    if (held > 0n) {
      const cashId = await userAccountId(tx, userId, "USER_CASH");
      await postTransaction(tx, "VERIFICATION_RELEASE", `verify_release:${holdId}:${Date.now()}`, [
        { accountId: holdId, amount: -held },
        { accountId: cashId, amount: held },
      ], { approved: approve });
    }
    await tx.user.update({ where: { id: userId }, data: { kycStatus: approve ? "VERIFIED" : "REJECTED" } });
    return { released: held };
  });
}

export async function initiateWithdrawal(userId: string, amountGhs: number, msisdn: string, idempotencyKey: string) {
  const amount = toPesewas(amountGhs);
  if (amount <= 0n) throw new WalletError("BAD_AMOUNT", "Amount must be positive");

  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } });
  if (user.kycStatus !== "VERIFIED" && (await verificationRequired(prisma, userId)))
    throw new WalletError("VERIFICATION_REQUIRED", "Complete withdrawal verification before withdrawing");

  const provider = paymentProvider();
  const ref = payRef("WDR");
  try {
    return await prisma.$transaction(async (tx) => {
      const cashId = await userAccountId(tx, userId, "USER_CASH");
      await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${cashId} FOR UPDATE`;
      const balance = await userCashBalance(tx, userId);
      if (balance < amount) throw new WalletError("INSUFFICIENT_FUNDS", "Insufficient balance for withdrawal");

      const clearingId = await houseAccountId(tx, "PAYMENT_CLEARING");
      const intent = await tx.paymentIntent.create({
        data: {
          ref, userId, direction: "WITHDRAWAL", amount, status: "PENDING",
          provider: provider.name, idempotencyKey, metadata: { msisdn },
        },
      });
      // Hold the funds now so they can't be spent while the payout is in flight.
      await postTransaction(tx, "WITHDRAWAL_HOLD", `wdr_hold:${intent.ref}`, [
        { accountId: cashId, amount: -amount },
        { accountId: clearingId, amount: amount },
      ], { ref: intent.ref });
      return intent;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return prisma.paymentIntent.findUniqueOrThrow({ where: { idempotencyKey } });
    throw e;
  }
}

/**
 * Apply a verified provider event. Idempotent at two layers: the WebhookEvent unique
 * key and the ledger transaction reference. Returns what happened.
 */
export async function processPaymentEvent(provider: string, ev: NormalisedEvent): Promise<"processed" | "duplicate" | "ignored"> {
  // Layer 1: has this exact provider event already been recorded?
  try {
    await prisma.webhookEvent.create({
      data: { provider, providerEventId: ev.providerEventId, payloadHash: ev.providerEventId, status: "RECEIVED" },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "duplicate";
    throw e;
  }

  const intent = await prisma.paymentIntent.findUnique({ where: { ref: ev.ourRef } });
  if (!intent) {
    await prisma.webhookEvent.update({ where: { provider_providerEventId: { provider, providerEventId: ev.providerEventId } }, data: { status: "IGNORED", processedAt: new Date(), error: "no matching intent" } });
    return "ignored";
  }
  if (intent.status !== "PENDING") {
    await prisma.webhookEvent.update({ where: { provider_providerEventId: { provider, providerEventId: ev.providerEventId } }, data: { status: "IGNORED", processedAt: new Date() } });
    return "ignored";
  }

  let notice: "DEPOSIT" | "WITHDRAWAL" | null = null;
  await prisma.$transaction(async (tx) => {
    if (intent.direction === "DEPOSIT") {
      if (ev.status === "SUCCEEDED") {
        const clearingId = await houseAccountId(tx, "PAYMENT_CLEARING");
        // Verification payments go to the player's hold (until an admin reviews) — unless both are
        // already in (two payments raced), in which case the extra is an ordinary deposit: never lost.
        let target = await userAccountId(tx, intent.userId, "USER_CASH");
        let kind = "DEPOSIT";
        if ((intent.metadata as { purpose?: string } | null)?.purpose === "VERIFICATION") {
          const hold = await heldForVerification(tx, intent.userId);
          const full = verifyAmount() * BigInt(VERIFY_PAYMENTS);
          if (hold.held + intent.amount <= full) {
            target = hold.id;
            kind = "VERIFICATION_DEPOSIT";
            if (hold.held + intent.amount === full) await tx.user.update({ where: { id: intent.userId }, data: { kycStatus: "PENDING" } });
          }
        }
        // Layer 2: unique reference — a duplicate that slips past layer 1 still can't double-credit.
        await postTransaction(tx, kind, `deposit:${intent.ref}`, [
          { accountId: clearingId, amount: -intent.amount },
          { accountId: target, amount: intent.amount },
        ], { ref: intent.ref });
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "SUCCEEDED", settledAt: new Date() } });
        if (kind === "DEPOSIT") notice = "DEPOSIT"; // verification payments are held, not spendable: no "deposit received"
      } else {
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED", settledAt: new Date() } });
      }
    } else {
      // WITHDRAWAL: funds already held on initiation.
      if (ev.status === "SUCCEEDED") {
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "SUCCEEDED", settledAt: new Date() } });
        notice = "WITHDRAWAL";
      } else {
        // Reverse the hold back to the user.
        const cashId = await userAccountId(tx, intent.userId, "USER_CASH");
        const clearingId = await houseAccountId(tx, "PAYMENT_CLEARING");
        await postTransaction(tx, "WITHDRAWAL_REVERSAL", `wdr_reverse:${intent.ref}`, [
          { accountId: clearingId, amount: -intent.amount },
          { accountId: cashId, amount: intent.amount },
        ], { ref: intent.ref });
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED", settledAt: new Date() } });
      }
    }
    await tx.webhookEvent.update({
      where: { provider_providerEventId: { provider, providerEventId: ev.providerEventId } },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  });
  if (notice) notifyPayment(intent.userId, notice, intent.amount, intent.ref);
  return "processed";
}

/** Players with verification money held or awaiting review, for the admin console. */
export async function verificationQueue() {
  const sums = await prisma.ledgerEntry.groupBy({
    by: ["accountId"],
    where: { account: { kind: "VERIFICATION_HOLD" } },
    _sum: { amount: true },
  });
  const heldBy = new Map(sums.filter((s) => (s._sum.amount ?? 0n) > 0n).map((s) => [s.accountId, s._sum.amount!]));
  const users = await prisma.user.findMany({
    where: { OR: [{ kycStatus: "PENDING" }, { ledgerAccounts: { some: { id: { in: [...heldBy.keys()] } } } }] },
    select: { id: true, email: true, kycStatus: true, ledgerAccounts: { where: { kind: "VERIFICATION_HOLD" }, select: { id: true } } },
  });
  const full = verifyAmount() * BigInt(VERIFY_PAYMENTS);
  return users
    .map((u) => {
      const held = u.ledgerAccounts.reduce((n, a) => n + (heldBy.get(a.id) ?? 0n), 0n);
      return { userId: u.id, email: u.email, status: u.kycStatus, held, complete: held >= full };
    })
    .sort((a, b) => Number(b.complete) - Number(a.complete));
}
