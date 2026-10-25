import { requireUser } from "@/lib/session";
import { emailVerified, sendVerificationCode } from "@/lib/emailFlows";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Email a new confirmation code (3 per 10 minutes). */
export async function POST() {
  try {
    const user = await requireUser();
    if (emailVerified(user)) return json({ ok: true, verified: true });
    if (!(await sendVerificationCode(user)))
      return json({ error: "We've sent a few codes already. Wait a few minutes and try again", code: "RATE_LIMIT" }, { status: 429 });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
