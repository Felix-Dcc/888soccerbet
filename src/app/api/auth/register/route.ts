import { registerUser } from "@/lib/accounts";
import { createSession } from "@/lib/session";
import { registerSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req) ?? "anon";
    if (!rateLimit(`register:${ip}`, 5, 60_000).ok)
      return json({ error: "Too many attempts, try again shortly", code: "RATE_LIMIT" }, { status: 429 });

    const body = await req.json();
    if (!(await verifyTurnstile(body.turnstileToken, clientIp(req))))
      return json({ error: "Complete the security check and try again", code: "CAPTCHA" }, { status: 400 });
    const input = registerSchema.parse(body);
    const user = await registerUser(input);
    await createSession(user.id);
    return json({ id: user.id, email: user.email }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
