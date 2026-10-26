import { z } from "zod";
import { requireUser } from "@/lib/session";
import { confirmDeposit } from "@/lib/wallet";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.object({ ref: z.string().min(3).max(40) });

/** "I've approved it": check the player's own deposit with the provider right now. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`deposit-confirm:${user.id}`, 20, 60_000).ok)
      return json({ error: "Too many checks. Wait a moment and try again", code: "RATE_LIMIT" }, { status: 429 });
    const { ref } = schema.parse(await req.json());
    const r = await confirmDeposit(user.id, ref);
    return json({ status: r.status, amount: r.amount, purpose: r.purpose });
  } catch (e) {
    return errorResponse(e);
  }
}
