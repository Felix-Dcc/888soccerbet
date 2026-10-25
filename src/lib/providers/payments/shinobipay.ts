/**
 * ShinobiPay (Ghana mobile money) for deposits. Real money: turned on with PAYMENT_PROVIDER=shinobipay
 * plus SHINOBI_SECRET_KEY (sk_test_... / sk_live_...) and SHINOBI_WEBHOOK_SECRET (whsec_..., shown
 * once when the webhook endpoint is registered in ShinobiPay's dashboard).
 *
 *  - Deposits: POST /v1/payment_intents (amount in pesewas, our ref as reference and Idempotency-Key).
 *    The player approves a prompt on their phone (or ShinobiPay's checkout page).
 *  - Webhooks: X-AkwaPay-Signature "t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>", rejected if
 *    older than 5 minutes. The intent is then re-read from the API before money moves.
 *  - Withdrawals: ShinobiPay has no payout-to-customer API, so payouts are "manual" (admin pays and
 *    marks them in the trading desk).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { PspError, type ChargeRequest, type ChargeResult, type PaymentProvider, type WebhookResult } from "./types";

const TOLERANCE_S = 300;

export class ShinobiPayError extends PspError {}

export class ShinobiPayProvider implements PaymentProvider {
  readonly name = "shinobipay";
  readonly payouts = "manual" as const;
  readonly isSandbox: boolean;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly apiUrl = (process.env.SHINOBI_API_URL || "https://akwapayapi.onrender.com").replace(/\/+$/, ""),
    private readonly appUrl = (process.env.APP_URL || "https://kingzbet.live").replace(/\/+$/, ""),
    private readonly now = () => Math.floor(Date.now() / 1000),
  ) {
    this.isSandbox = secretKey.startsWith("sk_test_");
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string) {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { http: res.status, json };
  }

  async initiate(req: ChargeRequest): Promise<ChargeResult> {
    // Never reached for withdrawals (payouts = "manual"); refuse loudly rather than pretend.
    if (req.direction !== "DEPOSIT") throw new ShinobiPayError("ShinobiPay can't send payouts to players");
    const { http, json } = await this.call(
      "POST",
      "/v1/payment_intents",
      {
        amount: Number(req.amountPesewas), // minor units (pesewas), integer
        currency: "GHS",
        method: "mobile_money",
        network: req.network, // MTN | TELECEL | AIRTELTIGO: the same codes as ours
        customer: { phone: req.msisdn, email: req.email },
        reference: req.ref,
        description: "Kingz Bet deposit",
        return_url: `${this.appUrl}/wallet`,
        metadata: { ref: req.ref },
      },
      req.ref, // our ref is unique per deposit, so a retried request can't charge twice
    );
    if (http === 200 || http === 201) {
      const nextAction = json.next_action as { type?: string; ussd_fallback?: string } | undefined;
      const checkout = typeof json.checkout_url === "string" ? json.checkout_url : undefined;
      const providerRef = typeof json.id === "string" ? json.id : null;
      if (nextAction?.type === "await_prompt") return { providerRef, status: "PENDING", prompt: { ussdFallback: nextAction.ussd_fallback ?? null } };
      return { providerRef, status: "PENDING", redirectUrl: checkout };
    }
    const err = json.error as { code?: string; message?: string } | undefined;
    // 402 (declined, invalid number...) and other 4xx: refused, nothing charged. 5xx/429: unclear, but
    // no intent exists on our side yet, so failing the request is safe (the player can try again).
    throw new ShinobiPayError(err?.message || `ShinobiPay refused the payment (${err?.code ?? `HTTP ${http}`})`);
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
    const header = headers.get("x-akwapay-signature");
    if (!header || !this.webhookSecret) return { ok: false };
    const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
    const t = Number(parts.t);
    const given = parts.v1;
    if (!Number.isInteger(t) || !given || !/^[0-9a-f]+$/i.test(given)) return { ok: false };
    if (Math.abs(this.now() - t) > TOLERANCE_S) return { ok: false }; // replayed or badly delayed
    const expected = createHmac("sha256", this.webhookSecret).update(`${t}.${rawBody}`).digest();
    const got = Buffer.from(given, "hex");
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false };

    let body: { id?: string; type?: string; data?: { intent_id?: string; reference?: string } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false };
    }
    const status = body.type === "payment_intent.succeeded" ? "SUCCEEDED" : body.type === "payment_intent.failed" ? "FAILED" : null;
    const intentId = body.data?.intent_id;
    const reference = body.data?.reference;
    if (!status || !body.id || !intentId || !reference || !/^[\w-]+$/.test(intentId)) return { ok: true, event: null };

    // Signed already; still confirm the final state with the API before any money moves.
    const { http, json } = await this.call("GET", `/v1/payment_intents/${intentId}`);
    if (http >= 500 || http === 429) throw new ShinobiPayError("ShinobiPay unavailable"); // non-2xx: it retries
    const live = json as { status?: string; amount?: number; currency?: string; reference?: string };
    const confirmed = status === "SUCCEEDED" ? live.status === "succeeded" : live.status === "failed";
    if (!confirmed || live.currency !== "GHS" || !Number.isInteger(live.amount)) return { ok: true, event: null };
    if (live.reference && live.reference !== reference) return { ok: true, event: null };
    return { ok: true, event: { providerEventId: body.id, ourRef: reference, status, amountPesewas: BigInt(live.amount!), direction: "DEPOSIT" } };
  }
}
