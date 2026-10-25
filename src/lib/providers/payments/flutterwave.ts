/**
 * Flutterwave (API v3) for Ghana mobile money. Real money: turned on with PAYMENT_PROVIDER=flutterwave
 * plus FLW_SECRET_KEY and FLW_SECRET_HASH (the "secret hash" set on the Flutterwave webhook page).
 *
 *  - Deposits: POST /charges?type=mobile_money_ghana. The player approves on Flutterwave's page
 *    (meta.authorization.redirect), then a charge.completed webhook arrives.
 *  - Withdrawals: POST /transfers to the player's number (233XXXXXXXXX); transfer.completed follows.
 *  - Webhooks: the verif-hash header must equal our secret hash. The event body is then only a hint:
 *    status, reference, amount and currency are re-read from Flutterwave's API before money moves.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { toPesewas } from "../../money";
import { PspError, type ChargeRequest, type ChargeResult, type Network, type PaymentProvider, type WebhookResult } from "./types";

const API = "https://api.flutterwave.com/v3";

// shortcut: Flutterwave's Ghana docs list these codes inconsistently (TIGO/AIRTELTIGO, VODAFONE/TELECEL);
// confirm with one test-mode charge and payout per network before launch and adjust here if refused.
const CHARGE_NETWORK: Record<Network, string> = { MTN: "MTN", TELECEL: "VODAFONE", AIRTELTIGO: "TIGO" };
const TRANSFER_NETWORK: Record<Network, string> = { MTN: "MTN", TELECEL: "VODAFONE", AIRTELTIGO: "AIRTELTIGO" };

const ghsAmount = (pesewas: bigint) => Number(pesewas) / 100;
const intl = (msisdn: string) => `233${msisdn.slice(1)}`; // 0241234567 -> 233241234567
const sha = (s: string) => createHash("sha256").update(s).digest();

export class FlutterwaveError extends PspError {}

export class FlutterwaveProvider implements PaymentProvider {
  readonly name = "flutterwave";
  readonly payouts = "api" as const;
  readonly isSandbox: boolean;

  constructor(
    private readonly secretKey: string,
    private readonly secretHash: string,
    private readonly appUrl = (process.env.APP_URL || "https://kingzbet.live").replace(/\/+$/, ""),
  ) {
    this.isSandbox = secretKey.includes("_TEST");
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<{ http: number; json: Record<string, unknown> }> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.secretKey}`, "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { http: res.status, json };
  }

  async initiate(req: ChargeRequest): Promise<ChargeResult> {
    if (req.direction === "DEPOSIT") {
      const { http, json } = await this.call("POST", "/charges?type=mobile_money_ghana", {
        tx_ref: req.ref,
        amount: ghsAmount(req.amountPesewas),
        currency: "GHS",
        country: "GH",
        email: req.email,
        phone_number: req.msisdn,
        network: CHARGE_NETWORK[req.network],
        ...(req.name ? { fullname: req.name } : {}),
        redirect_url: `${this.appUrl}/wallet`,
      });
      const meta = json.meta as { authorization?: { redirect?: string } } | undefined;
      const data = json.data as { id?: number | string } | undefined;
      if (http < 300 && json.status === "success")
        return { providerRef: data?.id != null ? String(data.id) : null, status: "PENDING", redirectUrl: meta?.authorization?.redirect };
      // No money has moved on a refused charge; the player sees Flutterwave's reason.
      throw new FlutterwaveError(typeof json.message === "string" ? json.message : `Flutterwave refused the charge (HTTP ${http})`);
    }

    const { http, json } = await this.call("POST", "/transfers", {
      account_bank: TRANSFER_NETWORK[req.network],
      account_number: intl(req.msisdn),
      amount: ghsAmount(req.amountPesewas),
      currency: "GHS",
      reference: req.ref, // unique: Flutterwave rejects a repeat, so a retried request can't pay twice
      narration: "Kingz Bet withdrawal",
      beneficiary_name: req.name || "Kingz Bet player",
      callback_url: `${this.appUrl}/api/webhooks/payments`,
    });
    const data = json.data as { id?: number | string } | undefined;
    if (http < 300 && json.status === "success") return { providerRef: data?.id != null ? String(data.id) : null, status: "PENDING" };
    // A clear 4xx refusal means nothing was queued: safe to give the player their money back.
    if (http >= 400 && http < 500 && json.status === "error") return { providerRef: null, status: "FAILED" };
    // 5xx / odd replies: the payout may or may not exist. Leave it pending for the webhook or a person.
    throw new FlutterwaveError(`Unclear payout response (HTTP ${http})`);
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
    const given = headers.get("verif-hash");
    // Hash both sides so the comparison is constant-time whatever their lengths.
    if (!given || !this.secretHash || !timingSafeEqual(sha(given), sha(this.secretHash))) return { ok: false };
    let body: { event?: string; data?: { id?: number | string } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false };
    }
    const id = body.data?.id;
    if (id == null || !/^\d+$/.test(String(id))) return { ok: true, event: null };

    if (body.event === "charge.completed") {
      const { http, json } = await this.call("GET", `/transactions/${id}/verify`);
      if (http >= 500) throw new FlutterwaveError("Flutterwave unavailable"); // 5xx back to Flutterwave: it retries
      const d = json.data as { id: number; tx_ref?: string; status?: string; amount?: number; currency?: string } | undefined;
      if (!d?.tx_ref || d.currency !== "GHS" || typeof d.amount !== "number") return { ok: true, event: null };
      const status = d.status === "successful" ? "SUCCEEDED" : d.status === "failed" ? "FAILED" : null;
      if (!status) return { ok: true, event: null }; // still pending: a later webhook settles it
      return { ok: true, event: { providerEventId: `charge:${d.id}:${status}`, ourRef: d.tx_ref, status, amountPesewas: toPesewas(d.amount), direction: "DEPOSIT" } };
    }

    if (body.event === "transfer.completed") {
      const { http, json } = await this.call("GET", `/transfers/${id}`);
      if (http >= 500) throw new FlutterwaveError("Flutterwave unavailable");
      const t = json.data as { id: number; reference?: string; status?: string; amount?: number; currency?: string } | undefined;
      if (!t?.reference || t.currency !== "GHS" || typeof t.amount !== "number") return { ok: true, event: null };
      const status = t.status === "SUCCESSFUL" ? "SUCCEEDED" : t.status === "FAILED" ? "FAILED" : null;
      if (!status) return { ok: true, event: null };
      return { ok: true, event: { providerEventId: `transfer:${t.id}:${status}`, ourRef: t.reference, status, amountPesewas: toPesewas(t.amount), direction: "WITHDRAWAL" } };
    }

    return { ok: true, event: null }; // other event types: acknowledged, nothing to do
  }
}
