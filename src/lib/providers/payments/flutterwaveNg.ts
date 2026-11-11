/**
 * Flutterwave (API v3) for Nigerian players: deposits in Naira on Flutterwave's hosted checkout
 * (card, bank transfer or USSD, the player picks there). Withdrawals never come here: an admin pays
 * them to the player's bank account by hand (NG_BANK_PROVIDER).
 *
 *  - Deposit: POST /payments with our ref as tx_ref -> data.link, the page the player pays on.
 *  - Webhook: charge.completed with the verif-hash header; the transaction is re-read from
 *    /transactions/:id/verify, and only a successful NGN charge for one of our refs counts.
 *  - Missed webhook: /transactions/verify_by_reference?tx_ref=<our ref>.
 *
 * Only success is final. A declined card can be retried on the same checkout page, so a failed
 * attempt never closes the deposit (closing it would lose a later successful payment).
 */
import { toPesewas } from "../../money";
import { FlutterwaveError, FlutterwaveProvider } from "./flutterwave";
import type { ChargeRequest, ChargeResult, NormalisedEvent, WebhookResult } from "./types";

type Tx = { id?: number; tx_ref?: string; status?: string; amount?: number; currency?: string };

const naira = (kobo: bigint) => Number(kobo) / 100;

export class FlutterwaveNgProvider extends FlutterwaveProvider {
  override readonly name = "flutterwave_ng";
  override readonly payouts = "manual" as const;

  override async initiate(req: ChargeRequest): Promise<ChargeResult> {
    if (req.direction !== "DEPOSIT") throw new FlutterwaveError("Nigerian withdrawals are paid by bank transfer from the admin console");
    if (!req.ngnKobo || req.ngnKobo <= 0n) throw new FlutterwaveError("No Naira amount for this deposit");
    const { http, json } = await this.call("POST", "/payments", {
      tx_ref: req.ref,
      amount: naira(req.ngnKobo),
      currency: "NGN",
      redirect_url: `${this.appUrl}/wallet`,
      payment_options: "card,banktransfer,ussd",
      customer: { email: req.email, ...(req.name ? { name: req.name } : {}) },
      customizations: { title: "Bet Zone deposit" },
    });
    const link = (json.data as { link?: unknown } | undefined)?.link;
    // providerRef = our tx_ref: what verify_by_reference looks the payment up by.
    if (http < 300 && json.status === "success" && typeof link === "string") return { providerRef: req.ref, status: "PENDING", redirectUrl: link };
    throw new FlutterwaveError(typeof json.message === "string" ? json.message : `Flutterwave refused the payment (HTTP ${http})`);
  }

  /** A verified Flutterwave transaction -> our event, or null when it isn't a finished NGN payment of ours. */
  private event(d: Tx | undefined, source: string): NormalisedEvent | null {
    if (!d?.tx_ref || d.id == null || d.currency !== "NGN" || typeof d.amount !== "number" || d.status !== "successful") return null;
    return { providerEventId: `${source}:${d.id}:SUCCEEDED`, ourRef: d.tx_ref, status: "SUCCEEDED", amountPesewas: toPesewas(d.amount), currency: "NGN", direction: "DEPOSIT" };
  }

  override async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
    if (!this.authentic(headers)) return { ok: false };
    let body: { event?: string; data?: { id?: number | string } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false };
    }
    const id = body.data?.id;
    if (body.event !== "charge.completed" || id == null || !/^\d+$/.test(String(id))) return { ok: true, event: null };
    const { http, json } = await this.call("GET", `/transactions/${id}/verify`);
    if (http >= 500) throw new FlutterwaveError("Flutterwave unavailable"); // 5xx back to Flutterwave: it retries
    return { ok: true, event: this.event(json.data as Tx | undefined, "charge") };
  }

  async checkDeposit(providerRef: string): Promise<{ status: "SUCCEEDED" | "FAILED"; amountPesewas: bigint; currency: "NGN" } | null> {
    const { http, json } = await this.call("GET", `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(providerRef)}`);
    if (http >= 500) throw new FlutterwaveError("Flutterwave unavailable");
    const ev = this.event(json.data as Tx | undefined, "check");
    // Not paid yet (or not found): ask again later. The ref must be the one we asked about.
    return ev && ev.ourRef === providerRef ? { status: "SUCCEEDED", amountPesewas: ev.amountPesewas, currency: "NGN" } : null;
  }
}
