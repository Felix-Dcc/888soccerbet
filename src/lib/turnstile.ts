/**
 * Cloudflare Turnstile (bot check) on sign-in and sign-up. Off when TURNSTILE_SECRET_KEY is unset
 * (local dev, tests); once set, a request without a valid single-use token is refused.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: unknown, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false; // Cloudflare unreachable: fail closed rather than let bots through
  }
}
