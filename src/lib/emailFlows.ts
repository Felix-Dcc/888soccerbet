/**
 * Email-backed account flows: sign-up email confirmation, self-service password reset, and the
 * win / deposit / withdrawal notices. Codes and links are single-use and stored only as hashes
 * (AccountToken), like admin setup links.
 */
import { randomBytes, randomInt } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { GHS_CURRENCY, type Currency } from "./currency";
import { hashToken } from "./auth";
import { audit } from "./audit";
import { rateLimit } from "./rateLimit";
import { AccountError, findUserByIdentifier } from "./accounts"; // not session.ts: that is server-only and the worker imports this
import { emails, resetLink, sendEmail } from "./email";

const CODE_TTL_MS = 30 * 60_000;
const RESET_TTL_MS = 30 * 60_000;

/** A 6-digit code is too small to be unique on its own, so its hash is bound to the user. */
const codeHash = (userId: string, code: string) => hashToken(`email-verify:${userId}:${code}`);

// Email verification is off: sign-up takes only a name, email and password, and no code is ever sent or asked for.
const needsVerifying = (_u: Pick<User, "role" | "emailVerifiedAt">) => false;

/** For the UI: false only while this player still has to enter their code. */
export const emailVerified = (u: Pick<User, "role" | "emailVerifiedAt">) => !needsVerifying(u);

/** Money stays locked until the player confirms their email. Staff are exempt. */
export function requireVerifiedEmail(u: Pick<User, "role" | "emailVerifiedAt">) {
  if (needsVerifying(u)) throw new AccountError("EMAIL_UNVERIFIED", "Confirm your email first: enter the code we sent you", 403);
}

/** Email a fresh confirmation code (older codes stop working). Returns false if rate-limited or already verified. */
export async function sendVerificationCode(user: Pick<User, "id" | "email" | "role" | "emailVerifiedAt">): Promise<boolean> {
  if (!needsVerifying(user)) return false;
  if (!rateLimit(`verify-send:${user.id}`, 3, 10 * 60_000).ok) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.accountToken.updateMany({ where: { userId: user.id, purpose: "EMAIL_VERIFY", usedAt: null }, data: { usedAt: new Date() } }),
    prisma.accountToken.create({ data: { userId: user.id, purpose: "EMAIL_VERIFY", tokenHash: codeHash(user.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } }),
  ]);
  await sendEmail(emails.verifyCode(user.email, code));
  return true;
}

/** Check the code the player typed. Five tries per 10 minutes, so guessing 1 in a million is hopeless. */
export async function confirmEmailCode(userId: string, rawCode: string): Promise<void> {
  if (!rateLimit(`verify-try:${userId}`, 5, 10 * 60_000).ok) throw new AccountError("RATE_LIMIT", "Too many tries. Wait a few minutes or send a new code", 429);
  const code = rawCode.replace(/\D/g, "");
  if (code.length !== 6) throw new AccountError("BAD_CODE", "Enter the 6-digit code", 400);
  await prisma.$transaction(async (tx) => {
    const used = await tx.accountToken.updateMany({
      where: { userId, purpose: "EMAIL_VERIFY", tokenHash: codeHash(userId, code), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!used.count) throw new AccountError("BAD_CODE", "That code is wrong or has expired", 400);
    await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    await audit({ actorUserId: userId, action: "EMAIL_VERIFIED", targetType: "User", targetId: userId }, tx);
  });
}

/**
 * "Forgot password": email a single-use reset link if the account exists and is active. The caller
 * always gets the same answer, so this can't be used to discover who has an account.
 */
export async function requestPasswordReset(identifier: string, ip?: string | null): Promise<void> {
  const user = await findUserByIdentifier(identifier);
  if (!user || user.status !== "ACTIVE") return;
  if (!rateLimit(`reset-send:${user.id}`, 3, 60 * 60_000).ok) return;
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.accountToken.updateMany({ where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: new Date() } });
    await tx.accountToken.create({ data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    await audit({ actorUserId: user.id, action: "PASSWORD_RESET_REQUEST", targetType: "User", targetId: user.id, ip: ip ?? undefined }, tx);
  });
  await sendEmail(emails.passwordReset(user.email, resetLink(token)));
}

/**
 * The player's display currency, for notices. Read straight from the settings row (not platformSettings.ts,
 * which is server-only: the worker sends these too); same rule as wallet.ts playerCurrency.
 */
async function noticeCurrency(country: string): Promise<Currency> {
  if (country !== "NG") return GHS_CURRENCY;
  const s = await prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { ngnPerGhs: true } });
  return s && s.ngnPerGhs > 0 ? { code: "NGN", rate: s.ngnPerGhs } : GHS_CURRENCY;
}

/** Notices go out after the money has moved; a failure is logged, never thrown. */
export function notifyWin(userId: string, payout: bigint, ref: string) {
  void (async () => {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, country: true } });
    if (u) await sendEmail(emails.win(u.email, payout, ref, await noticeCurrency(u.country)));
  })().catch((e) => console.error("[email] win notice", e));
}

export function notifyPayment(userId: string, direction: "DEPOSIT" | "WITHDRAWAL", amount: bigint, ref: string) {
  void (async () => {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, country: true } });
    if (!u) return;
    const currency = await noticeCurrency(u.country);
    await sendEmail(direction === "DEPOSIT" ? emails.deposit(u.email, amount, ref, currency) : emails.withdrawal(u.email, amount, ref, currency));
  })().catch((e) => console.error("[email] payment notice", e));
}
