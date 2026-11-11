import { ngDepositProvider, paymentProvider, type PaymentProvider } from "@/lib/providers/payments";
import { processPaymentEvent } from "@/lib/wallet";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Flutterwave callback. Set https://betzone.com.co/api/webhooks/flutterwave and the secret hash
 * (FLW_SECRET_HASH) on Flutterwave's webhook settings page. Flutterwave allows one webhook URL per
 * account, so this serves Nigerian Naira deposits and, if Ghana is on Flutterwave too, Ghana's events
 * (each adapter only takes its own currency). 200 = handled, 401 = not from Flutterwave,
 * 500 = Flutterwave retries.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const candidates = [ngDepositProvider(), paymentProvider()].filter((p): p is PaymentProvider => !!p && p.name.startsWith("flutterwave"));
    if (candidates.length === 0) return json({ error: "not configured" }, { status: 404 });
    for (const provider of new Set(candidates)) {
      const verified = await provider.verifyWebhook(raw, req.headers);
      if (!verified.ok) return json({ error: "invalid signature" }, { status: 401 });
      if (verified.event) return json({ result: await processPaymentEvent(provider.name, verified.event) });
    }
    return json({ result: "ignored" });
  } catch (e) {
    console.error("[webhook] flutterwave callback failed, Flutterwave will retry:", e);
    return json({ error: "temporarily unavailable" }, { status: 500 });
  }
}
