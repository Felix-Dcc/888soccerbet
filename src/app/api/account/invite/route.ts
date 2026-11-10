import { z } from "zod";
import { acceptAdminInvite } from "@/lib/admins";
import { createSession } from "@/lib/session";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    token: z.string().min(20).max(100),
    email: z.string().email("Enter a valid email").max(200).transform((s) => s.toLowerCase().trim()),
    password: z.string().min(10, "Use at least 10 characters").max(200),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

/** A new administrator accepts their invite link: their own email and password, then they are signed in. */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`invite:${clientIp(req) ?? "anon"}`, 10, 10 * 60_000).ok)
      return json({ error: "Too many attempts, try again later", code: "RATE_LIMIT" }, { status: 429 });
    const input = schema.parse(await req.json());
    const user = await acceptAdminInvite(input.token, input.email, input.password, clientIp(req));
    await createSession(user.id, false);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
