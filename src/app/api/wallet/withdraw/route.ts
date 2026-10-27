import { requireUser } from "@/lib/session";
import { initiateWithdrawal } from "@/lib/wallet";
import { withdrawSchema } from "@/lib/validation";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { requireVerifiedEmail } from "@/lib/emailFlows";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireVerifiedEmail(user);
    if (!rateLimit(`withdraw:${user.id}`, 10, 60_000).ok)
      return json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
    const input = withdrawSchema.parse(await req.json());
    const intent = await initiateWithdrawal(user.id, input.amountGhs, input.msisdn, input.idempotencyKey, input.network, input.accountName);
    return json({ intent: { ref: intent.ref, status: intent.status, amount: intent.amount } }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
