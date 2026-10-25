import { z } from "zod";
import { consumeAccessToken } from "@/lib/admins";
import { createSession } from "@/lib/session";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    token: z.string().min(20).max(100),
    password: z.string().min(10, "Use at least 10 characters").max(200),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

/** An invited admin, or anyone with a reset link, sets their password from their single-use link, then is signed in. */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`setup:${clientIp(req) ?? "anon"}`, 10, 10 * 60_000).ok)
      return json({ error: "Too many attempts, try again later", code: "RATE_LIMIT" }, { status: 429 });
    const input = schema.parse(await req.json());
    const { userId, role } = await consumeAccessToken(input.token, input.password);
    await createSession(userId, false);
    return json({ ok: true, staff: role !== "USER" });
  } catch (e) {
    return errorResponse(e);
  }
}
