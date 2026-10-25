import { verifyPassword } from "@/lib/auth";
import { findUserByIdentifier } from "@/lib/accounts";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req) ?? "anon";
    const body = await req.json();
    const input = loginSchema.parse(body);
    // Rate-limit by IP and by account to blunt credential stuffing / targeted brute force.
    for (const key of [`login:ip:${ip}`, `login:acct:${input.identifier.toLowerCase()}`]) {
      if (!rateLimit(key, 10, 60_000).ok)
        return json({ error: "Too many attempts, try again shortly", code: "RATE_LIMIT" }, { status: 429 });
    }

    // After the rate limit, so floods are cut off before costing a Cloudflare call.
    if (!(await verifyTurnstile(body.turnstileToken, clientIp(req))))
      return json({ error: "Complete the security check and try again", code: "CAPTCHA" }, { status: 400 });

    const user = await findUserByIdentifier(input.identifier);
    // Same response whether the account exists or not (no account enumeration).
    if (!user || !verifyPassword(input.password, user.passwordHash))
      return json({ error: "Wrong phone/email or password", code: "BAD_CREDENTIALS" }, { status: 401 });
    if (user.status !== "ACTIVE") return json({ error: "Your account is not active", code: "INACTIVE" }, { status: 403 });

    await createSession(user.id, input.remember);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return json({ id: user.id, email: user.email, role: user.role });
  } catch (e) {
    return errorResponse(e);
  }
}
