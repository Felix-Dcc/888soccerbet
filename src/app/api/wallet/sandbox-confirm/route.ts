import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { signSandboxEvent } from "@/lib/providers/payments/sandboxMomo";
import { json, errorResponse } from "@/lib/http";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * SANDBOX ONLY. Stands in for the mobile-money provider: builds a correctly-signed
 * webhook for one of the caller's own pending intents and delivers it to the real
 * webhook endpoint. Disabled unless PAYMENT_PROVIDER=sandbox. There is no real money.
 */
export async function POST(req: Request) {
  try {
    if ((process.env.PAYMENT_PROVIDER ?? "sandbox") !== "sandbox")
      return json({ error: "sandbox disabled" }, { status: 404 });

    const user = await requireUser();
    const { ref, outcome } = (await req.json()) as { ref: string; outcome?: "SUCCEEDED" | "FAILED" };
    const intent = await prisma.paymentIntent.findUnique({ where: { ref } });
    if (!intent || intent.userId !== user.id) return json({ error: "intent not found" }, { status: 404 });

    const { body, signature } = signSandboxEvent({
      id: `sbxevt_${randomBytes(8).toString("hex")}`,
      ref: intent.ref,
      status: outcome ?? "SUCCEEDED",
      amountPesewas: intent.amount.toString(),
    });

    // Deliver through the genuine webhook path so signature + idempotency run for real.
    const url = new URL("/api/webhooks/payments", process.env.APP_URL ?? req.url);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-sb-signature": signature }, body });
    return json({ delivered: res.ok, webhook: await res.json() });
  } catch (e) {
    return errorResponse(e);
  }
}
