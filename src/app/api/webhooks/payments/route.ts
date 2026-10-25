import { paymentProvider } from "@/lib/providers/payments";
import { processPaymentEvent } from "@/lib/wallet";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Payment provider callback (Flutterwave: set this URL and the secret hash on its webhook page).
 * The ONLY place a deposit gets credited. Authenticity is checked before anything is trusted,
 * and processing is idempotent. 200 = handled (or nothing to do); 401 = not from the PSP;
 * 500 = try again later (the PSP retries).
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const provider = paymentProvider();
    const verified = await provider.verifyWebhook(raw, req.headers);
    if (!verified.ok) return json({ error: "invalid signature" }, { status: 401 });
    if (!verified.event) return json({ result: "ignored" });
    const result = await processPaymentEvent(provider.name, verified.event);
    return json({ result });
  } catch (e) {
    console.error("[webhook] payment callback failed, provider will retry:", e);
    return json({ error: "temporarily unavailable" }, { status: 500 });
  }
}
