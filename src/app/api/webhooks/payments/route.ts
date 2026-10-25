import { paymentProvider } from "@/lib/providers/payments";
import { processPaymentEvent } from "@/lib/wallet";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Payment provider callback. The ONLY place a deposit gets credited. Signature is
 * verified before anything is trusted; processing is idempotent.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-stakra-signature");
  const provider = paymentProvider();

  const event = provider.verifyWebhook(raw, signature);
  if (!event) return json({ error: "invalid signature" }, { status: 401 });

  const result = await processPaymentEvent(provider.name, event);
  return json({ result });
}
