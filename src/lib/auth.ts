/**
 * Password hashing (scrypt, from node:crypto — no native build step) and session
 * token handling. Tokens are random 256-bit secrets; only their SHA-256 hash is
 * stored, so a database leak does not expose usable session tokens.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const SCRYPT_N = 16384;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  if (password.length < 8) throw new Error("password too short");
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2]!, "hex");
  const expected = Buffer.from(parts[3]!, "hex");
  const actual = scryptSync(password, salt, expected.length, { N: n });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
export const SESSION_COOKIE = "stk_session";

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** HMAC-style helper used for webhook signatures (reused to keep deps minimal). */
export function hmacHex(secret: string, payload: string): string {
  return createHash("sha256").update(`${secret}:${payload}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
