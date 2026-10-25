import { z } from "zod";
import { requireUser } from "@/lib/session";
import { initiateVerificationPayment } from "@/lib/wallet";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { requireVerifiedEmail } from "@/lib/emailFlows";
import { network } from "@/lib/validation";

export const dynamic = "force-dynamic";

// How the player approves: a page to open (Flutterwave), or a prompt already on their phone (ShinobiPay).
const approvalOf = (metadata: unknown) => {
  const m = metadata as { redirectUrl?: string; prompt?: { ussdFallback: string | null } } | null;
  return { redirectUrl: m?.redirectUrl ?? null, prompt: m?.prompt ?? null };
};

const schema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  msisdn: z.string().regex(/^0\d{9}$/, "Enter a 10-digit mobile number, e.g. 0241234567"),
  network,
});

/** One withdrawal-verification payment (fixed amount, held until an admin reviews). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireVerifiedEmail(user);
    if (!rateLimit(`verify:${user.id}`, 10, 60_000).ok)
      return json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
    const input = schema.parse(await req.json());
    const intent = await initiateVerificationPayment(user.id, input.msisdn, input.idempotencyKey, input.network);
    // PENDING on purpose: the hold is only credited when the signed webhook arrives.
    return json({ intent: { ref: intent.ref, status: intent.status, amount: intent.amount }, ...approvalOf(intent.metadata) }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
