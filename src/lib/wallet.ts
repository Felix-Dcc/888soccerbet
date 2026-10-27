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
import { MANUAL_PAYOUT_PROVIDERS, paymentProvider } from "./providers/payments";
import { audit } from "./audit";
import { guessNetwork, PspError, type Network, type NormalisedEvent } from "./providers/payments/types";
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
async function createDepositIntent(userId: string, amount: bigint, msisdn: string, network: Network, idempotencyKey: string, purpose?: "VERIFICATION") {
  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  await checkDepositAllowed(userId, amount);

  const provider = paymentProvider();
  const ref = payRef(purpose ? "VER" : "DEP");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, displayName: true } });
  let charge;
  try {
    charge = await provider.initiate({ ref, amountPesewas: amount, msisdn, network, direction: "DEPOSIT", email: user.email, name: user.displayName });
  } catch (e) {
    if (e instanceof PspError) throw new WalletError("PAYMENT_REFUSED", e.message);
    throw e;
  }
  // The approval page (if the PSP has one) is kept on the intent so a retried request gets it back.
  const meta = {
    msisdn,
    network,
    ...(purpose ? { purpose } : {}),
    ...(charge.redirectUrl ? { redirectUrl: charge.redirectUrl } : {}),
    ...(charge.prompt ? { prompt: charge.prompt } : {}),
  };
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
        metadata: meta,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return prisma.paymentIntent.findUniqueOrThrow({ where: { idempotencyKey } });
    throw e;
  }
}

export async function initiateDeposit(userId: string, amountGhs: number, msisdn: string, idempotencyKey: string, network: Network = guessNetwork(msisdn)) {
  const amount = toPesewas(amountGhs);
  if (amount <= 0n) throw new WalletError("BAD_AMOUNT", "Amount must be positive");
  const min = minDeposit();
  if (amount < min) throw new WalletError("DEPOSIT_TOO_LOW", `Minimum deposit is GHS ${min / 100n}`);
  return createDepositIntent(userId, amount, msisdn, network, idempotencyKey);
}

/** One verification payment (fixed amount). Refused once verified or while both are awaiting review. */
export async function initiateVerificationPayment(userId: string, msisdn: string, idempotencyKey: string, network: Network = guessNetwork(msisdn)) {
  const v = await verificationState(userId);
  if (v.status === "VERIFIED") throw new WalletError("ALREADY_VERIFIED", "Your account is already verified");
  if (!v.required && v.held === 0n) throw new WalletError("NOT_REQUIRED", "Verification isn't needed yet — you can withdraw");
  if (v.paid >= v.needed) throw new WalletError("AWAITING_REVIEW", "Both verification payments are in — awaiting review");
  return createDepositIntent(userId, v.perPayment, msisdn, network, idempotencyKey, "VERIFICATION");
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

/**
 * Admin verifies a player directly (no verification payments needed): they can then withdraw
 * without the standard verification step. Any money already held for verification is released to
 * their balance, as on a normal approval. Safe to call on an already-verified player (no-op credit).
 */
export async function verifyPlayer(userId: string): Promise<{ released: bigint }> {
  return prisma.$transaction(async (tx) => {
    const { id: holdId } = await heldForVerification(tx, userId);
    await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${holdId} FOR UPDATE`;
    const held = await accountBalance(tx, holdId);
    if (held > 0n) {
      const cashId = await userAccountId(tx, userId, "USER_CASH");
      await postTransaction(tx, "VERIFICATION_RELEASE", `verify_release:${holdId}:${Date.now()}`, [
        { accountId: holdId, amount: -held },
        { accountId: cashId, amount: held },
      ], { approved: true, direct: true });
    }
    await tx.user.update({ where: { id: userId }, data: { kycStatus: "VERIFIED" } });
    return { released: held };
  });
}

export async function initiateWithdrawal(userId: string, amountGhs: number, msisdn: string, idempotencyKey: string, network: Network = guessNetwork(msisdn), accountName?: string) {
  const amount = toPesewas(amountGhs);
  if (amount <= 0n) throw new WalletError("BAD_AMOUNT", "Amount must be positive");

  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true, email: true, displayName: true } });
  if (user.kycStatus !== "VERIFIED" && (await verificationRequired(prisma, userId)))
    throw new WalletError("VERIFICATION_REQUIRED", "Complete withdrawal verification before withdrawing");

  const provider = paymentProvider();
  const ref = payRef("WDR");
  let intent;
  try {
    intent = await prisma.$transaction(async (tx) => {
      const cashId = await userAccountId(tx, userId, "USER_CASH");
      await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${cashId} FOR UPDATE`;
      const balance = await userCashBalance(tx, userId);
      if (balance < amount) throw new WalletError("INSUFFICIENT_FUNDS", "Insufficient balance for withdrawal");

      const clearingId = await houseAccountId(tx, "PAYMENT_CLEARING");
      const intent = await tx.paymentIntent.create({
        data: {
          ref, userId, direction: "WITHDRAWAL", amount, status: "PENDING",
          provider: provider.name, idempotencyKey, metadata: { msisdn, network, ...(accountName ? { accountName } : {}) },
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

  // Manual payouts: the money stays held until an admin sends it and marks it paid (or failed: refunded).
  if (provider.payouts === "manual") return intent;

  // The money is held (committed above) before the payout is asked for, so it can't be spent twice.
  let payout;
  try {
    payout = await provider.initiate({ ref: intent.ref, amountPesewas: amount, msisdn, network, direction: "WITHDRAWAL", email: user.email, name: user.displayName });
  } catch (e) {
    // Unclear outcome (timeout, 5xx): the payout may exist, so keep the hold; the webhook settles it.
    console.error(`[wallet] payout ${intent.ref} outcome unknown, left pending:`, e);
    return intent;
  }
  if (payout.status === "FAILED") {
    // The PSP refused it outright: hand the money back through the normal failed-payment path.
    await processPaymentEvent(provider.name, { providerEventId: `refused:${intent.ref}`, ourRef: intent.ref, status: "FAILED", amountPesewas: amount });
    throw new WalletError("PAYOUT_REFUSED", "The payout couldn't be sent, so your balance is back. Check the number and network and try again");
  }
  if (payout.providerRef) return prisma.paymentIntent.update({ where: { id: intent.id }, data: { providerRef: payout.providerRef } });
  return intent;
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
  // Money moves only for exactly what we asked: a different amount or kind of payment is flagged, never applied.
  const mismatch =
    ev.direction && ev.direction !== intent.direction ? `direction ${ev.direction} != ${intent.direction}`
    // A PSP may charge its fee on top of a deposit (ShinobiPay: +2%), so a deposit needs at least the
    // amount asked and is credited exactly that; a payout must match exactly.
    : (intent.direction === "DEPOSIT" ? ev.amountPesewas < intent.amount : ev.amountPesewas !== intent.amount) ? `amount ${ev.amountPesewas} vs ${intent.amount}`
    : null;
  if (mismatch) {
    console.error(`[wallet] payment event for ${intent.ref} rejected: ${mismatch}`);
    await prisma.webhookEvent.update({ where: { provider_providerEventId: { provider, providerEventId: ev.providerEventId } }, data: { status: "FAILED", processedAt: new Date(), error: mismatch } });
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

/**
 * Ask the PSP about deposits still pending after a minute (a webhook can be lost, e.g. sent to the wrong
 * URL). A confirmed outcome goes through processPaymentEvent like a webhook, so it is credited once: a
 * webhook arriving later finds the deposit already settled and is ignored. Runs when a player opens
 * their wallet (their own deposits only).
 */
export async function reconcilePendingDeposits(userId: string): Promise<number> {
  const provider = paymentProvider();
  if (!provider.checkDeposit) return 0;
  const now = Date.now();
  const pending = await prisma.paymentIntent.findMany({
    where: { userId, direction: "DEPOSIT", status: "PENDING", provider: provider.name, providerRef: { not: null }, createdAt: { lt: new Date(now - 60_000), gt: new Date(now - 7 * 86_400_000) } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  let settled = 0;
  for (const intent of pending) if (await settleFromProvider(provider, intent)) settled++;
  return settled;
}

/** Ask the PSP about one pending deposit and apply a final answer once. True if it was settled now. */
async function settleFromProvider(provider: ReturnType<typeof paymentProvider>, intent: { ref: string; providerRef: string | null }): Promise<boolean> {
  if (!provider.checkDeposit || !intent.providerRef) return false;
  try {
    const r = await provider.checkDeposit(intent.providerRef);
    if (!r) return false;
    const res = await processPaymentEvent(provider.name, {
      providerEventId: `check:${intent.providerRef}:${r.status}`,
      ourRef: intent.ref,
      status: r.status,
      amountPesewas: r.amountPesewas,
      direction: "DEPOSIT",
    });
    return res === "processed";
  } catch (e) {
    console.error(`[wallet] status check for ${intent.ref} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * The player says they've approved a deposit: check it with the PSP now (no waiting for the webhook)
 * and report where it stands. Credited at most once, whichever of this, the webhook or the wallet
 * check gets there first.
 */
export async function confirmDeposit(userId: string, ref: string): Promise<{ status: "SUCCEEDED" | "PENDING" | "FAILED"; amount: bigint; purpose: string | null }> {
  const intent = await prisma.paymentIntent.findUnique({ where: { ref } });
  if (!intent || intent.userId !== userId || intent.direction !== "DEPOSIT") throw new WalletError("NOT_FOUND", "Deposit not found");
  if (intent.status === "PENDING") {
    const provider = paymentProvider();
    if (intent.provider === provider.name) await settleFromProvider(provider, intent);
  }
  const now = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
  const status = now.status === "SUCCEEDED" || now.status === "PENDING" ? now.status : "FAILED";
  return { status, amount: now.amount, purpose: (now.metadata as { purpose?: string } | null)?.purpose ?? null };
}

/** Withdrawals waiting for an admin to send the money (providers that can't pay players), oldest first. */
export function manualPayoutQueue() {
  return prisma.paymentIntent.findMany({
    where: { direction: "WITHDRAWAL", status: "PENDING", provider: { in: [...MANUAL_PAYOUT_PROVIDERS] } },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { user: { select: { id: true, email: true, displayName: true, phone: true } } },
  });
}

/**
 * An admin records a withdrawal they paid by hand. PAID: the held money is the payout (player is
 * emailed). FAILED: it goes back to the player's balance. Exactly one decision per withdrawal, even
 * if two admins click at once (the webhook-event key "manual:<ref>" is unique).
 */
export async function recordManualPayout(actorId: string, ref: string, outcome: "PAID" | "FAILED", ip?: string | null) {
  const intent = await prisma.paymentIntent.findUnique({ where: { ref } });
  if (!intent || intent.direction !== "WITHDRAWAL") throw new WalletError("NOT_FOUND", "Withdrawal not found");
  // Never for payouts a PSP is sending itself: marking one failed while the PSP pays would pay twice.
  if (!MANUAL_PAYOUT_PROVIDERS.has(intent.provider)) throw new WalletError("NOT_MANUAL", "This withdrawal is paid by the payment provider, not by hand");
  if (intent.status !== "PENDING") throw new WalletError("ALREADY_DONE", "This withdrawal has already been settled");
  const result = await processPaymentEvent("manual", {
    providerEventId: `manual:${ref}`,
    ourRef: ref,
    status: outcome === "PAID" ? "SUCCEEDED" : "FAILED",
    amountPesewas: intent.amount,
    direction: "WITHDRAWAL",
  });
  if (result !== "processed") throw new WalletError("ALREADY_DONE", "This withdrawal has already been settled");
  const meta = intent.metadata as { msisdn?: string; network?: string } | null;
  await audit({
    actorUserId: actorId,
    action: outcome === "PAID" ? "PAYOUT_MARKED_PAID" : "PAYOUT_MARKED_FAILED",
    targetType: "PaymentIntent",
    targetId: intent.id,
    after: { ref, userId: intent.userId, amount: intent.amount.toString(), msisdn: meta?.msisdn ?? null, network: meta?.network ?? null },
    ip: ip ?? undefined,
  });
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
