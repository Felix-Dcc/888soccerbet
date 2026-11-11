/** Account creation and login lookup. Route handlers stay thin; this is what tests exercise. */
import { Prisma, type User } from "@prisma/client";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { normaliseCode, referralCode } from "./ids";
import { TERMS_VERSION } from "./legal";

/**
 * The account a referral code belongs to (dashes, spaces and case ignored). Admin codes used to be
 * "ADM" + the 8 characters they are now, so a link shared before still finds its admin.
 */
async function findByReferralCode(raw: string) {
  const c = normaliseCode(raw);
  const found = await prisma.user.findUnique({ where: { referralCode: c } });
  if (found || !/^ADM[A-Z0-9]{8}$/.test(c)) return found;
  return prisma.user.findUnique({ where: { referralCode: c.slice(3) } });
}

export class AccountError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

/**
 * Ghana mobile numbers -> canonical "0XXXXXXXXX". Accepts 0XXXXXXXXX, 233XXXXXXXXX and
 * +233XXXXXXXXX with spaces or dashes. Returns null for anything else.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (/^0\d{9}$/.test(digits)) return digits;
  if (/^233\d{9}$/.test(digits)) return "0" + digits.slice(3);
  return null;
}

/** New self-exclusion end: never earlier than one already running (it can be extended, not cut short). */
export function extendSelfExclusion(current: Date | null, days: number, now: Date = new Date()): Date {
  const next = new Date(now.getTime() + days * 86_400_000);
  return current && current > next ? current : next;
}

export function isAdult(dob: Date, now: Date = new Date()): boolean {
  const eighteenth = new Date(dob);
  eighteenth.setFullYear(eighteenth.getFullYear() + 18);
  return eighteenth <= now;
}

export interface RegisterInput {
  name?: string; // shown as the player's name
  email: string;
  password: string;
  phone: string;
  dateOfBirth: string;
  referralCode?: string;
  referralSource?: "LINK" | "CODE"; // arrived on a referral link, or typed the code
  acceptTerms: true; // the player ticked the consent box
}

export async function registerUser(input: RegisterInput): Promise<User> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new AccountError("BAD_PHONE", "Enter a 10-digit mobile number, e.g. 0241234567");

  const dob = new Date(input.dateOfBirth);
  if (!isAdult(dob)) throw new AccountError("UNDERAGE", "You must be 18 or older to register", 403);

  let referredById: string | undefined;
  if (input.referralCode) {
    // Checked here, never trusted from the browser. Only administrators' codes count (players don't
    // refer players). A suspended admin's code no longer brings in new players; players it already
    // referred keep their attribution.
    const referrer = await findByReferralCode(input.referralCode);
    if (!referrer || referrer.role === "USER" || referrer.status !== "ACTIVE") throw new AccountError("BAD_REFERRAL", "Referral code not found");
    referredById = referrer.id;
  } else if (process.env.DEFAULT_REFERRAL_CODE) {
    // No code given: the player goes to the default administrator. Never blocks a sign-up: if that
    // code is wrong or its admin isn't active, the player is simply left unattributed.
    const fallback = await findByReferralCode(process.env.DEFAULT_REFERRAL_CODE);
    if (fallback && fallback.role !== "USER" && fallback.status === "ACTIVE") referredById = fallback.id;
  }

  const passwordHash = hashPassword(input.password);
  // Retry only on a referral-code collision (8 chars from a 30-symbol alphabet: rare).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.user.create({
        data: {
          email: input.email,
          displayName: input.name?.trim() || null,
          passwordHash,
          phone,
          dateOfBirth: dob,
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
          referralCode: referralCode(),
          // Attribution is written once, here, and nothing updates it afterwards.
          referredById,
          ...(referredById ? { referredAt: new Date(), referralSource: input.referralCode ? (input.referralSource ?? "CODE") : "AUTO" } : {}),
        },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
      const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
      if (target.includes("email")) throw new AccountError("EMAIL_TAKEN", "An account with this email already exists", 409);
      if (target.includes("phone")) throw new AccountError("PHONE_TAKEN", "An account with this phone number already exists", 409);
      if (!target.includes("referralCode")) throw e;
    }
  }
  throw new Error("could not allocate a referral code");
}

/** Login accepts an email or a phone number in any common Ghana format. */
export function findUserByIdentifier(identifier: string): Promise<User | null> {
  const id = identifier.trim();
  if (id.includes("@")) return prisma.user.findUnique({ where: { email: id.toLowerCase() } });
  const phone = normalizePhone(id);
  return phone ? prisma.user.findUnique({ where: { phone } }) : Promise.resolve(null);
}
