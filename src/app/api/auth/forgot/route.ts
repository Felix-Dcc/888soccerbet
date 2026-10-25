import { z } from "zod";
import { requestPasswordReset } from "@/lib/emailFlows";
import { verifyTurnstile } from "@/lib/turnstile";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.object({ identifier: z.string().trim().min(1, "Enter your phone or email").max(200) });

/** "Forgot password": same answer whether or not the account exists. */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`forgot:${ip ?? "anon"}`, 5, 15 * 60_000).ok)
      return json({ error: "Too many requests, try again later", code: "RATE_LIMIT" }, { status: 429 });
    const body = await req.json();
    if (!(await verifyTurnstile(body.turnstileToken, ip)))
      return json({ error: "Complete the security check and try again", code: "CAPTCHA" }, { status: 400 });
    const { identifier } = schema.parse(body);
    await requestPasswordReset(identifier, ip);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
