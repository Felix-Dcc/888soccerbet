import { requireUser } from "@/lib/session";
import { initiateBankWithdrawal, initiateWithdrawal } from "@/lib/wallet";
import { ngWithdrawSchema, withdrawSchema } from "@/lib/validation";
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
    const body = await req.json();
    // Nigerians are paid by hand to a bank account; Ghanaians to mobile money.
    const intent =
      user.country === "NG"
        ? await (async () => {
            const i = ngWithdrawSchema.parse(body);
            return initiateBankWithdrawal(user.id, i.amountGhs, { bankName: i.bankName, accountNumber: i.accountNumber, accountName: i.accountName }, i.idempotencyKey);
          })()
        : await (async () => { const i = withdrawSchema.parse(body); return initiateWithdrawal(user.id, i.amountGhs, i.msisdn, i.idempotencyKey, i.network, i.accountName); })();
    return json({ intent: { ref: intent.ref, status: intent.status, amount: intent.amount } }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
