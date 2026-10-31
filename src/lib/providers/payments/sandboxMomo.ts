/**
 * Sandbox Mobile Money provider. NO REAL MONEY MOVES. It mimics a real PSP's shape:
 *  - initiate() returns a PENDING provider reference (as a real STK-push would),
 *  - a webhook later confirms SUCCEEDED/FAILED and is HMAC-signed,
 *  - verifyWebhook() rejects unsigned/forged events.
 * A test helper (signEvent) builds a correctly-signed event so the flow is exercisable
 * without a live PSP. Swap this adapter for Paystack/Hubtel/Flutterwave in production.
 */
import { hmacHex, safeEqualHex } from "../../auth";
import type { PaymentProvider, ChargeRequest, ChargeResult, WebhookResult } from "./types";

function secret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-webhook-secret";
}

export interface SandboxEventPayload {
  id: string;
  ref: string;
  status: "SUCCEEDED" | "FAILED";
  amountPesewas: string; // stringified bigint for JSON
}

/** Build a signed event body — used by the sandbox "confirm" endpoint and by tests. */
export function signSandboxEvent(payload: SandboxEventPayload): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  return { body, signature: hmacHex(secret(), body) };
}

export class SandboxMomoProvider implements PaymentProvider {
  readonly name = "sandbox";
  readonly isSandbox = true;
  readonly payouts = "api" as const;

  async initiate(req: ChargeRequest): Promise<ChargeResult> {
    // A real provider would trigger an STK push here and return its own reference.
    return { providerRef: `sbx_${req.ref}`, status: "PENDING" };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
    const signature = headers.get("x-sb-signature");
    if (!signature) return { ok: false };
    const expected = hmacHex(secret(), rawBody);
    if (!safeEqualHex(expected, signature)) return { ok: false };
    let p: SandboxEventPayload;
    try {
      p = JSON.parse(rawBody);
    } catch {
      return { ok: false };
    }
    if (!p.id || !p.ref || (p.status !== "SUCCEEDED" && p.status !== "FAILED")) return { ok: false };
    return { ok: true, event: { providerEventId: p.id, ourRef: p.ref, status: p.status, amountPesewas: BigInt(p.amountPesewas) } };
  }
}
