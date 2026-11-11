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
import { MANUAL_PAYOUT_PROVIDERS, ngDepositProvider, paymentProvider, type PaymentProvider } from "./providers/payments";
import { NG_BANK_PROVIDER, toKobo } from "./nigeria";
import { GHS_CURRENCY, type Currency } from "./currency";
import { audit } from "./audit";
import { guessNetwork, PspError, type Network, type NormalisedEvent } from "./providers/payments/types";
import { notifyPayment } from "./emailFlows";
import { isStaff } from "./permissions";

export class WalletError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Smallest deposit accepted — reads from admin Platform Settings. */
export async function minDeposit() {
  const { getPlatformSettings } = await import("./platformSettings");
  const s = await getPlatformSettings();
  return toPesewas(s.minDepositGhs);
}

/**
 * Two-stage withdrawal verification, required of a player (never staff) once a bet wins GHS
 * VERIFY_WIN_GHS or more, or a single cash out pays that much. Each stage requires VERIFY_PAYMENTS
 * separate payments held until admin review.
 *
 * Stage 1 — KYC: payments of kycVerificationFeeGhs, held in VERIFICATION_HOLD.
 *   approve → KYC_APPROVED (moves to stage 2); reject → REJECTED (can retry stage 1).
 *
 * Stage 2 — NTT Compliance: payments of nttComplianceFeeGhs, held in NTT_HOLD.
 *   approve → VERIFIED (can withdraw); reject → NTT_REJECTED (can retry stage 2).
 *
 * Both stages: held money is ALWAYS returned to the player's balance, whether approved or rejected.
 * A stage already submitted for review (PENDING / NTT_PENDING) counts as complete, so players who
 * finished it when fewer payments were needed are never asked for more.
 */
export const VERIFY_PAYMENTS = 5;
/** A win (or a single cash out) of this much or more triggers verification. Fixed here on purpose: the old VERIFY_AFTER_WIN_GHS setting is ignored. */
export const VERIFY_WIN_GHS = 1000;

async function verificationRequired(db: Prisma.TransactionClient | typeof prisma, userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || isStaff(user)) return false;
  const min = toPesewas(VERIFY_WIN_GHS);
  if (await db.bet.findFirst({ where: { userId, status: "WON", potentialPayout: { gte: min } }, select: { id: true } })) return true;
  // A full cash out settles its bet as WON with potentialPayout 0, so cash outs are checked by what they paid.
  return !!(await db.cashout.findFirst({ where: { bet: { userId }, amount: { gte: min } }, select: { id: true } }));
}

async function loadFees() {
  const { getPlatformSettings } = await import("./platformSettings");
  const s = await getPlatformSettings();
  return { kyc: toPesewas(s.kycVerificationFeeGhs), ntt: toPesewas(s.nttComplianceFeeGhs) };
}
export async function verifyAmount() { return (await loadFees()).kyc; }
export async function nttAmount() { return (await loadFees()).ntt; }

async function heldForVerification(db: Prisma.TransactionClient | typeof prisma, userId: string): Promise<{ id: string; held: bigint }> {
  const id = await userAccountId(db, userId, "VERIFICATION_HOLD");
  return { id, held: await accountBalance(db, id) };
}
async function heldForNtt(db: Prisma.TransactionClient | typeof prisma, userId: string): Promise<{ id: string; held: bigint }> {
  const id = await userAccountId(db, userId, "NTT_HOLD");
  return { id, held: await accountBalance(db, id) };
}

type Stage = "kyc" | "ntt";
export interface VerificationStage { paid: number; needed: number; perPaymentGhs: number; heldGhs: number; }
export interface VerificationInfo {
  required: boolean;
  stage: Stage;
  kyc: VerificationStage;
  ntt: VerificationStage;
  status: string;
}

export async function verificationState(userId: string): Promise<VerificationInfo> {
  const fees = await loadFees();
  const [kycHold, nttHold, user, required] = await Promise.all([
    heldForVerification(prisma, userId),
    heldForNtt(prisma, userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } }),
    verificationRequired(prisma, userId),
  ]);
  const kycPaid = user.kycStatus === "PENDING" ? VERIFY_PAYMENTS : Math.min(Number(kycHold.held / fees.kyc), VERIFY_PAYMENTS);
  const nttPaid = user.kycStatus === "NTT_PENDING" ? VERIFY_PAYMENTS : Math.min(Number(nttHold.held / fees.ntt), VERIFY_PAYMENTS);
  const inNtt = user.kycStatus === "KYC_APPROVED" || user.kycStatus === "NTT_PENDING" || user.kycStatus === "NTT_REJECTED";
  return {
    required,
    stage: inNtt ? "ntt" : "kyc",
    kyc: { paid: kycPaid, needed: VERIFY_PAYMENTS, perPaymentGhs: Number(fees.kyc) / 100, heldGhs: Number(kycHold.held) / 100 },
    ntt: { paid: nttPaid, needed: VERIFY_PAYMENTS, perPaymentGhs: Number(fees.ntt) / 100, heldGhs: Number(nttHold.held) / 100 },
    status: user.kycStatus,
  };
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

export const FAILED_DEPOSITS_BEFORE_PAUSE = 3;
export const DEPOSIT_PAUSE_MS = 5 * 60_000;

/**
 * Every 3rd failed deposit in a row (e.g. not enough money on the MoMo wallet) pauses new deposits for
 * 5 minutes from that failure, so prompts can't be spammed; after the pause they get 3 fresh tries.
 */
export async function depositPauseUntil(userId: string, now = Date.now()): Promise<Date | null> {
  const recent = await prisma.paymentIntent.findMany({
    where: { userId, direction: "DEPOSIT" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { status: true, settledAt: true, createdAt: true },
  });
  let streak = 0;
  while (streak < recent.length && recent[streak]!.status === "FAILED") streak++;
  if (streak === 0 || streak % FAILED_DEPOSITS_BEFORE_PAUSE !== 0) return null;
  const last = recent[0]!;
  const until = (last.settledAt ?? last.createdAt).getTime() + DEPOSIT_PAUSE_MS;
  return until > now ? new Date(until) : null;
}

/** Shared by deposits, KYC verification and NTT compliance payments. */
async function createDepositIntent(userId: string, amount: bigint, msisdn: string, network: Network, idempotencyKey: string, purpose?: "VERIFICATION" | "NTT") {
  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  const pausedUntil = await depositPauseUntil(userId);
  if (pausedUntil) {
    const min = Math.max(1, Math.ceil((pausedUntil.getTime() - Date.now()) / 60_000));
    throw new WalletError(
      "DEPOSIT_PAUSED",
      `Your last ${FAILED_DEPOSITS_BEFORE_PAUSE} deposits didn't go through. Please check your mobile money balance and try again in ${min} minute${min === 1 ? "" : "s"}.`,
    );
  }
  await checkDepositAllowed(userId, amount);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, displayName: true, country: true } });
  // Nigerians pay the Naira equivalent on Flutterwave's checkout; Ghanaians pay by mobile money.
  let provider: PaymentProvider;
  let ngn: { kobo: string; rate: number } | null = null;
  if (user.country === "NG") {
    const p = ngDepositProvider();
    const rate = await ngnPerGhs();
    if (!p || rate <= 0) throw new WalletError("NIGERIA_CLOSED", "Deposits from Nigeria aren't open yet");
    provider = p;
    ngn = { kobo: toKobo(amount, rate).toString(), rate };
  } else {
    if (!/^0\d{9}$/.test(msisdn)) throw new WalletError("BAD_NUMBER", "Enter a 10-digit mobile number, e.g. 0241234567");
    provider = paymentProvider();
  }
  const ref = payRef(purpose === "NTT" ? "NTT" : purpose === "VERIFICATION" ? "VER" : "DEP");
  let charge;
  try {
    charge = await provider.initiate({
      ref, amountPesewas: amount, direction: "DEPOSIT", email: user.email, name: user.displayName,
      ...(ngn ? { ngnKobo: BigInt(ngn.kobo) } : { msisdn, network }),
    });
  } catch (e) {
    if (e instanceof PspError) throw new WalletError("PAYMENT_REFUSED", e.message);
    throw e;
  }
  // The approval page (if the PSP has one) is kept on the intent so a retried request gets it back.
  const meta = {
    ...(ngn
      ? {
          country: "NG",
          ngn,
          // What the PSP must report as paid, checked before anything is credited (the sandbox reports GHS).
          ...(provider.name === "flutterwave_ng" ? { charge: { currency: "NGN", minor: ngn.kobo } } : {}),
        }
      : { msisdn, network }),
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
  const min = await minDeposit();
  if (amount < min) throw new WalletError("DEPOSIT_TOO_LOW", `Minimum deposit is GHS ${min / 100n}`);
  return createDepositIntent(userId, amount, msisdn, network, idempotencyKey);
}

/** One verification payment (fixed amount). Handles both KYC and NTT stages. */
export async function initiateVerificationPayment(userId: string, msisdn: string, idempotencyKey: string, network: Network = guessNetwork(msisdn)) {
  const v = await verificationState(userId);
  if (v.status === "VERIFIED") throw new WalletError("ALREADY_VERIFIED", "Your account is already verified");
  const kycHeldAny = v.kyc.heldGhs > 0;
  const nttHeldAny = v.ntt.heldGhs > 0;
  if (!v.required && !kycHeldAny && !nttHeldAny) throw new WalletError("NOT_REQUIRED", "Verification isn't needed yet — you can withdraw");
  if (v.stage === "ntt") {
    if (v.ntt.paid >= v.ntt.needed) throw new WalletError("AWAITING_REVIEW", "All NTT payments are in — awaiting review");
    const fees = await loadFees();
    return createDepositIntent(userId, fees.ntt, msisdn, network, idempotencyKey, "NTT");
  }
  if (v.kyc.paid >= v.kyc.needed) throw new WalletError("AWAITING_REVIEW", "All KYC payments are in — awaiting review");
  const fees = await loadFees();
  return createDepositIntent(userId, fees.kyc, msisdn, network, idempotencyKey, "VERIFICATION");
}

/** Admin decision on KYC verification. Approve → KYC_APPROVED (moves to NTT stage). Reject → REJECTED. */
export async function reviewVerification(userId: string, approve: boolean): Promise<{ released: bigint; nextStatus: string }> {
  return prisma.$transaction(async (tx) => {
    const { id: holdId } = await heldForVerification(tx, userId);
    await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${holdId} FOR UPDATE`;
    const held = await accountBalance(tx, holdId);
    const { kycStatus } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } });
    const complete = held >= (await verifyAmount()) * BigInt(VERIFY_PAYMENTS) || (kycStatus === "PENDING" && held > 0n);
    if (approve && !complete) throw new WalletError("NOT_READY", "All KYC payments must be in before approval");
    if (!approve && held === 0n) throw new WalletError("NOTHING_HELD", "No KYC payments to review");
    if (held > 0n) {
      const cashId = await userAccountId(tx, userId, "USER_CASH");
      await postTransaction(tx, "VERIFICATION_RELEASE", `verify_release:${holdId}:${Date.now()}`, [
        { accountId: holdId, amount: -held },
        { accountId: cashId, amount: held },
      ], { approved: approve });
    }
    const nextStatus = approve ? "KYC_APPROVED" : "REJECTED";
    await tx.user.update({ where: { id: userId }, data: { kycStatus: nextStatus } });
    return { released: held, nextStatus };
  });
}

/** Admin decision on NTT compliance. Approve → VERIFIED (can withdraw). Reject → NTT_REJECTED (can retry). */
export async function reviewNttCompliance(userId: string, approve: boolean): Promise<{ released: bigint; nextStatus: string }> {
  return prisma.$transaction(async (tx) => {
    const { id: holdId } = await heldForNtt(tx, userId);
    await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${holdId} FOR UPDATE`;
    const held = await accountBalance(tx, holdId);
    const { kycStatus } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } });
    const complete = held >= (await nttAmount()) * BigInt(VERIFY_PAYMENTS) || (kycStatus === "NTT_PENDING" && held > 0n);
    if (approve && !complete) throw new WalletError("NOT_READY", "All NTT payments must be in before approval");
    if (!approve && held === 0n) throw new WalletError("NOTHING_HELD", "No NTT payments to review");
    if (held > 0n) {
      const cashId = await userAccountId(tx, userId, "USER_CASH");
      await postTransaction(tx, "NTT_RELEASE", `ntt_release:${holdId}:${Date.now()}`, [
        { accountId: holdId, amount: -held },
        { accountId: cashId, amount: held },
      ], { approved: approve });
    }
    const nextStatus = approve ? "VERIFIED" : "NTT_REJECTED";
    await tx.user.update({ where: { id: userId }, data: { kycStatus: nextStatus } });
    return { released: held, nextStatus };
  });
}

/** Admin verifies a player directly, skipping both stages. */
export async function verifyPlayer(userId: string): Promise<{ released: bigint }> {
  return prisma.$transaction(async (tx) => {
    let totalReleased = 0n;
    for (const kind of ["VERIFICATION_HOLD", "NTT_HOLD"] as const) {
      const holdId = await userAccountId(tx, userId, kind);
      await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${holdId} FOR UPDATE`;
      const held = await accountBalance(tx, holdId);
      if (held > 0n) {
        const cashId = await userAccountId(tx, userId, "USER_CASH");
        await postTransaction(tx, "VERIFICATION_RELEASE", `verify_release:${holdId}:${Date.now()}`, [
          { accountId: holdId, amount: -held },
          { accountId: cashId, amount: held },
        ], { approved: true, direct: true });
        totalReleased += held;
      }
    }
    await tx.user.update({ where: { id: userId }, data: { kycStatus: "VERIFIED" } });
    return { released: totalReleased };
  });
}

/** Naira per GHS for Nigerian players (admin setting); 0 = Nigeria closed. */
export async function ngnPerGhs(): Promise<number> {
  const { getPlatformSettings } = await import("./platformSettings");
  return (await getPlatformSettings()).ngnPerGhs;
}

/** What a player sees money in: Naira at today's rate for a Nigerian player while Nigeria is open, else GHS. */
export async function playerCurrency(user: { country: string } | null | undefined): Promise<Currency> {
  if (user?.country !== "NG") return GHS_CURRENCY;
  const rate = await ngnPerGhs();
  return rate > 0 ? { code: "NGN", rate } : GHS_CURRENCY;
}

/** Nigerians can sign up and pay in: a Naira rate is set and a provider takes Naira (or the site is a sandbox). */
export async function nigeriaOpen(): Promise<boolean> {
  return ngDepositProvider() !== null && (await ngnPerGhs()) > 0;
}

type PayoutTo =
  | { kind: "momo"; msisdn: string; network: Network; accountName?: string }
  | { kind: "bank"; bankName: string; accountNumber: string; accountName: string };

/** Ghana: a withdrawal to mobile money. */
export async function initiateWithdrawal(userId: string, amountGhs: number, msisdn: string, idempotencyKey: string, network: Network = guessNetwork(msisdn), accountName?: string) {
  return requestWithdrawal(userId, amountGhs, idempotencyKey, { kind: "momo", msisdn, network, accountName });
}

/** Nigeria: a withdrawal an admin pays by hand to the player's bank account, in Naira at today's rate. */
export async function initiateBankWithdrawal(userId: string, amountGhs: number, bank: { bankName: string; accountNumber: string; accountName: string }, idempotencyKey: string) {
  return requestWithdrawal(userId, amountGhs, idempotencyKey, { kind: "bank", ...bank });
}

async function requestWithdrawal(userId: string, amountGhs: number, idempotencyKey: string, to: PayoutTo) {
  const amount = toPesewas(amountGhs);
  if (amount <= 0n) throw new WalletError("BAD_AMOUNT", "Amount must be positive");
  const { getPlatformSettings } = await import("./platformSettings");
  const settings = await getPlatformSettings();
  const minWd = toPesewas(settings.minWithdrawalGhs);
  if (amount < minWd) throw new WalletError("WITHDRAWAL_TOO_LOW", `Minimum withdrawal is GHS ${settings.minWithdrawalGhs}`);

  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true, email: true, displayName: true, role: true, country: true } });
  if ((user.country === "NG") !== (to.kind === "bank"))
    throw new WalletError("WRONG_PAYOUT", user.country === "NG" ? "Withdrawals from Nigeria go to a bank account" : "Withdrawals go to a mobile money number");
  let payoutMeta: Prisma.InputJsonObject;
  if (to.kind === "bank") {
    const rate = await ngnPerGhs();
    if (rate <= 0) throw new WalletError("NIGERIA_CLOSED", "Withdrawals from Nigeria aren't open yet");
    // The Naira the admin sends, fixed at today's rate when the player asks.
    payoutMeta = { country: "NG", bankName: to.bankName, accountNumber: to.accountNumber, accountName: to.accountName, ngn: { kobo: toKobo(amount, rate).toString(), rate } };
  } else {
    payoutMeta = { msisdn: to.msisdn, network: to.network, ...(to.accountName ? { accountName: to.accountName } : {}) };
  }
  if (user.kycStatus !== "VERIFIED" && (await verificationRequired(prisma, userId)))
    throw new WalletError("VERIFICATION_REQUIRED", "Complete withdrawal verification before withdrawing");

  if (!isStaff(user)) {
    // Real deposits only: verification payments (KYC/NTT) are held and returned, so they count for neither rule below.
    const [deposited] = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM "PaymentIntent"
      WHERE "userId" = ${userId} AND direction = 'DEPOSIT' AND status = 'SUCCEEDED'
        AND COALESCE(metadata->>'purpose', '') NOT IN ('VERIFICATION', 'NTT')`;
    const totalDeposits = deposited?.total ?? 0n;

    // Says what is still missing: with GHS 600 required and GHS 200 deposited, "an additional GHS 400.00".
    const depositShort = toPesewas(settings.minDepositToWithdrawGhs) - totalDeposits;
    if (settings.minDepositToWithdrawGhs > 0 && depositShort > 0n)
      throw new WalletError("DEPOSIT_REQUIREMENT", `You need an additional GHS ${formatPesewas(depositShort)} deposit before withdrawing`);

    if (settings.minLifetimeStakeGhs > 0) {
      const totalStake = (await prisma.bet.aggregate({ where: { userId }, _sum: { stake: true } }))._sum.stake ?? 0n;
      if (totalStake < toPesewas(settings.minLifetimeStakeGhs))
        throw new WalletError("STAKE_REQUIREMENT", `You need at least GHS ${settings.minLifetimeStakeGhs} in total bets before withdrawing`);
    }

    if (settings.withdrawalCapMultiplier > 0) {
      const cap = totalDeposits * BigInt(settings.withdrawalCapMultiplier);
      if (cap > 0n && amount > cap)
        throw new WalletError("WITHDRAWAL_CAP", `Withdrawal limited to ${settings.withdrawalCapMultiplier}× your total deposits`);
    }
  }

  // Nigerian payouts are always sent by hand; Ghana's go through the PSP (or by hand, ShinobiPay).
  const provider: Pick<PaymentProvider, "name" | "payouts" | "initiate"> =
    to.kind === "bank" ? { name: NG_BANK_PROVIDER, payouts: "manual", initiate: () => Promise.reject(new Error("paid by hand")) } : paymentProvider();
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
          provider: provider.name, idempotencyKey, metadata: payoutMeta,
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
  if (provider.payouts === "manual") {
    // Admin-role accounts settle their own payout at once — no second admin's approval. Players are never auto-completed.
    if (isStaff(user) && MANUAL_PAYOUT_PROVIDERS.has(intent.provider)) {
      await recordManualPayout(userId, intent.ref, "PAID");
      return { ...intent, status: "SUCCEEDED" as const };
    }
    return intent;
  }

  // The money is held (committed above) before the payout is asked for, so it can't be spent twice.
  if (to.kind !== "momo") return intent; // unreachable: bank payouts are manual
  let payout;
  try {
    payout = await provider.initiate({ ref: intent.ref, amountPesewas: amount, msisdn: to.msisdn, network: to.network, direction: "WITHDRAWAL", email: user.email, name: user.displayName });
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
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    // Seen before. Only a finished event is a duplicate: one left RECEIVED by an attempt that failed midway must be
    // retried, or its deposit is stuck. Still credited once: the intent must be PENDING and the ledger reference is unique.
    const seen = await prisma.webhookEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: ev.providerEventId } }, select: { status: true } });
    if (seen?.status !== "RECEIVED") return "duplicate";
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
  // Money moves only for exactly what we asked: a different amount, currency or kind of payment is flagged, never applied.
  // A Naira deposit is checked against the Naira asked (metadata.charge) and credited its GHS amount.
  const charge = intent.direction === "DEPOSIT" ? (intent.metadata as { charge?: { currency: string; minor: string } } | null)?.charge : undefined;
  const askedCurrency = charge?.currency ?? "GHS";
  const asked = charge ? BigInt(charge.minor) : intent.amount;
  const mismatch =
    ev.direction && ev.direction !== intent.direction ? `direction ${ev.direction} != ${intent.direction}`
    : (ev.currency ?? "GHS") !== askedCurrency ? `currency ${ev.currency ?? "GHS"} != ${askedCurrency}`
    // A PSP may charge its fee on top of a deposit (ShinobiPay: +2%), so a deposit needs at least the
    // amount asked and is credited exactly that; a payout must match exactly.
    : (intent.direction === "DEPOSIT" ? ev.amountPesewas < asked : ev.amountPesewas !== asked) ? `amount ${ev.amountPesewas} vs ${asked}`
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
        const purpose = (intent.metadata as { purpose?: string } | null)?.purpose;
        if (purpose === "VERIFICATION") {
          const hold = await heldForVerification(tx, intent.userId);
          const full = (await verifyAmount()) * BigInt(VERIFY_PAYMENTS);
          if (hold.held + intent.amount <= full) {
            target = hold.id;
            kind = "VERIFICATION_DEPOSIT";
            if (hold.held + intent.amount === full) await tx.user.update({ where: { id: intent.userId }, data: { kycStatus: "PENDING" } });
          }
        } else if (purpose === "NTT") {
          const hold = await heldForNtt(tx, intent.userId);
          const full = (await nttAmount()) * BigInt(VERIFY_PAYMENTS);
          if (hold.held + intent.amount <= full) {
            target = hold.id;
            kind = "NTT_DEPOSIT";
            if (hold.held + intent.amount === full) await tx.user.update({ where: { id: intent.userId }, data: { kycStatus: "NTT_PENDING" } });
          }
        }
        // Layer 2: unique reference — a duplicate that slips past layer 1 still can't double-credit.
        await postTransaction(tx, kind, `deposit:${intent.ref}`, [
          { accountId: clearingId, amount: -intent.amount },
          { accountId: target, amount: intent.amount },
        ], { ref: intent.ref });
        // A spendable deposit opens the site for a new player (verification payments are held, so they don't).
        if (kind === "DEPOSIT") await tx.user.updateMany({ where: { id: intent.userId, depositRequired: true }, data: { depositRequired: false } });
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
 * their wallet (their own deposits only), and every few seconds on the server for everyone's recent ones.
 */
/** Every provider deposits can be open with right now: Ghana's, plus Nigeria's when it is a different one. */
function depositProviders(): PaymentProvider[] {
  const gh = paymentProvider();
  const ng = ngDepositProvider();
  return ng && ng.name !== gh.name ? [gh, ng] : [gh];
}

export async function reconcilePendingDeposits(userId?: string, maxAgeMs = 7 * 86_400_000): Promise<number> {
  let settled = 0;
  for (const provider of depositProviders()) settled += await reconcileWith(provider, userId, maxAgeMs);
  return settled;
}

async function reconcileWith(provider: PaymentProvider, userId: string | undefined, maxAgeMs: number): Promise<number> {
  if (!provider.checkDeposit) return 0;
  const now = Date.now();
  const pending = await prisma.paymentIntent.findMany({
    where: {
      ...(userId ? { userId } : {}),
      direction: "DEPOSIT",
      status: "PENDING",
      provider: provider.name,
      providerRef: { not: null },
      createdAt: { lt: new Date(now - 10_000), gt: new Date(now - maxAgeMs) },
    },
    orderBy: { createdAt: "asc" },
    take: userId ? 5 : 25,
  });
  let settled = 0;
  for (const intent of pending) if (await settleFromProvider(provider, intent)) settled++;
  return settled;
}

/** Ask the PSP about one pending deposit and apply a final answer once. True if it was settled now. */
async function settleFromProvider(provider: PaymentProvider, intent: { ref: string; providerRef: string | null }): Promise<boolean> {
  if (!provider.checkDeposit || !intent.providerRef) return false;
  try {
    const r = await provider.checkDeposit(intent.providerRef);
    if (!r) return false;
    const res = await processPaymentEvent(provider.name, {
      providerEventId: `check:${intent.providerRef}:${r.status}`,
      ourRef: intent.ref,
      status: r.status,
      amountPesewas: r.amountPesewas,
      ...(r.currency ? { currency: r.currency } : {}),
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
    const provider = depositProviders().find((p) => p.name === intent.provider);
    if (provider) await settleFromProvider(provider, intent);
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
  const meta = intent.metadata as { msisdn?: string; network?: string; bankName?: string; accountNumber?: string; ngn?: { kobo: string } } | null;
  await audit({
    actorUserId: actorId,
    action: outcome === "PAID" ? "PAYOUT_MARKED_PAID" : "PAYOUT_MARKED_FAILED",
    targetType: "PaymentIntent",
    targetId: intent.id,
    after: {
      ref, userId: intent.userId, amount: intent.amount.toString(), msisdn: meta?.msisdn ?? null, network: meta?.network ?? null,
      ...(meta?.bankName ? { bankName: meta.bankName, accountNumber: meta.accountNumber ?? null, ngnKobo: meta.ngn?.kobo ?? null } : {}),
    },
    ip: ip ?? undefined,
  });
}

/** Players with verification money held or awaiting review, for the admin console. */
export async function verificationQueue() {
  const [kycSums, nttSums] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["accountId"], where: { account: { kind: "VERIFICATION_HOLD" } }, _sum: { amount: true } }),
    prisma.ledgerEntry.groupBy({ by: ["accountId"], where: { account: { kind: "NTT_HOLD" } }, _sum: { amount: true } }),
  ]);
  const kycHeldBy = new Map(kycSums.filter((s) => (s._sum.amount ?? 0n) > 0n).map((s) => [s.accountId, s._sum.amount!]));
  const nttHeldBy = new Map(nttSums.filter((s) => (s._sum.amount ?? 0n) > 0n).map((s) => [s.accountId, s._sum.amount!]));
  const allHoldIds = [...kycHeldBy.keys(), ...nttHeldBy.keys()];
  const users = await prisma.user.findMany({
    where: { OR: [{ kycStatus: { in: ["PENDING", "NTT_PENDING"] } }, { ledgerAccounts: { some: { id: { in: allHoldIds } } } }] },
    select: { id: true, email: true, kycStatus: true, ledgerAccounts: { where: { kind: { in: ["VERIFICATION_HOLD", "NTT_HOLD"] } }, select: { id: true, kind: true } } },
  });
  const fees = await loadFees();
  const kycFull = fees.kyc * BigInt(VERIFY_PAYMENTS);
  const nttFull = fees.ntt * BigInt(VERIFY_PAYMENTS);
  return users
    .map((u) => {
      const kycHeld = u.ledgerAccounts.filter((a) => a.kind === "VERIFICATION_HOLD").reduce((n, a) => n + (kycHeldBy.get(a.id) ?? 0n), 0n);
      const nttHeld = u.ledgerAccounts.filter((a) => a.kind === "NTT_HOLD").reduce((n, a) => n + (nttHeldBy.get(a.id) ?? 0n), 0n);
      const stage: "kyc" | "ntt" = ["KYC_APPROVED", "NTT_PENDING", "NTT_REJECTED"].includes(u.kycStatus) ? "ntt" : "kyc";
      // Submitted for review counts as complete (finished when fewer payments were needed).
      const complete = stage === "ntt" ? nttHeld >= nttFull || (u.kycStatus === "NTT_PENDING" && nttHeld > 0n) : kycHeld >= kycFull || (u.kycStatus === "PENDING" && kycHeld > 0n);
      return { userId: u.id, email: u.email, status: u.kycStatus, stage, kycHeld, nttHeld, complete };
    })
    .sort((a, b) => Number(b.complete) - Number(a.complete));
}
