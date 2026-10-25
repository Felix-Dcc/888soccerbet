/** Server-side session helpers built on the cookie + Session table. */
import "server-only";
import { cookies, headers } from "next/headers";
import type { AdminRole, User } from "@prisma/client";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_TTL_MS, newSessionToken, hashToken, verifyPassword } from "./auth";
import { can, isStaff, type Permission, type SuperAction } from "./permissions";
import { rateLimit } from "./rateLimit";

export type CurrentUser = User & { adminRole: AdminRole | null };

const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

/** remember=false: browser-session cookie and a 12h server-side expiry instead of 14 days. */
// Only what a session needs: no IP address or browser details are stored (nothing used them).
export async function createSession(userId: string, remember = true): Promise<void> {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + (remember ? SESSION_TTL_MS : SHORT_SESSION_MS));
  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });
  const jar = await cookies();
  // https-only in production, except on a request known to be plain http (a phone on the local
  // network), where a Secure cookie would be dropped and sign-in would silently fail.
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https" || (process.env.NODE_ENV === "production" && proto !== "http"),
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { adminRole: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  return session.user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "authentication required");
  return user;
}

/** Any admin or super admin. Deny by default: players get 403. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isStaff(user)) throw new HttpError(403, "forbidden");
  return user;
}

/** Staff holding this permission (checked on the server for every protected action). */
export async function requirePermission(p: Permission | SuperAction): Promise<CurrentUser> {
  const user = await requireStaff();
  if (!can(user, p)) throw new HttpError(403, "forbidden");
  return user;
}

/** Re-authentication for sensitive admin actions: the actor types their password again. */
export function confirmPassword(user: User, password: unknown): void {
  if (!rateLimit(`reauth:${user.id}`, 10, 10 * 60_000).ok) throw new HttpError(429, "Too many attempts, try again later", "RATE_LIMIT");
  if (typeof password !== "string" || !password || !verifyPassword(password, user.passwordHash))
    throw new HttpError(401, "Password incorrect", "REAUTH_FAILED");
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
