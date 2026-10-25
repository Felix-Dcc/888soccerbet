import { requireUser } from "@/lib/session";
import { initiateDeposit } from "@/lib/wallet";
import { depositSchema } from "@/lib/validation";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { requireVerifiedEmail } from "@/lib/emailFlows";

export const dynamic = "force-dynamic";

// Where the player approves the payment (Flutterwave), if the provider needs it.
const redirectOf = (metadata: unknown) => (metadata as { redirectUrl?: string } | null)?.redirectUrl ?? null;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireVerifiedEmail(user);
    if (!rateLimit(`deposit:${user.id}`, 10, 60_000).ok)
      return json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
    const input = depositSchema.parse(await req.json());
    const intent = await initiateDeposit(user.id, input.amountGhs, input.msisdn, input.idempotencyKey, input.network);
    // PENDING on purpose: the balance is only credited when the signed webhook arrives.
    return json({ intent: { ref: intent.ref, status: intent.status, amount: intent.amount }, redirectUrl: redirectOf(intent.metadata) }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
