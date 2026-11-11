import { requireUser } from "@/lib/session";
import { initiateDeposit } from "@/lib/wallet";
import { depositSchema, ngDepositSchema } from "@/lib/validation";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { requireVerifiedEmail } from "@/lib/emailFlows";

export const dynamic = "force-dynamic";

// How the player approves: a page to open (Flutterwave), or a prompt already on their phone (ShinobiPay).
const approvalOf = (metadata: unknown) => {
  const m = metadata as { redirectUrl?: string; prompt?: { ussdFallback: string | null } } | null;
  return { redirectUrl: m?.redirectUrl ?? null, prompt: m?.prompt ?? null };
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireVerifiedEmail(user);
    if (!rateLimit(`deposit:${user.id}`, 10, 60_000).ok)
      return json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
    const body = await req.json();
    // Nigerians pay on Flutterwave's checkout page, so there is no mobile money number to ask for.
    const intent =
      user.country === "NG"
        ? await (async () => { const i = ngDepositSchema.parse(body); return initiateDeposit(user.id, i.amountGhs, "", i.idempotencyKey); })()
        : await (async () => { const i = depositSchema.parse(body); return initiateDeposit(user.id, i.amountGhs, i.msisdn, i.idempotencyKey, i.network); })();
    // PENDING on purpose: the balance is only credited when the signed webhook arrives.
    return json({ intent: { ref: intent.ref, status: intent.status, amount: intent.amount }, ...approvalOf(intent.metadata) }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
