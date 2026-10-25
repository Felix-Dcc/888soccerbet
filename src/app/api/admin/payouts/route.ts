import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { recordManualPayout } from "@/lib/wallet";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ ref: z.string().min(3).max(40), outcome: z.enum(["PAID", "FAILED"]), password: z.string() });

/** Record a withdrawal an admin paid by hand: PAID, or FAILED (refunds the player). Password re-checked. */
export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json());
    const actor = await requirePermission("payments.payout");
    confirmPassword(actor, input.password);
    await recordManualPayout(actor.id, input.ref, input.outcome, clientIp(req));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
