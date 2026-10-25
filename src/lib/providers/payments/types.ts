/** Payment (Mobile Money) provider contract. Adapters implement this so the PSP is swappable. */

/** Ghana mobile money networks, as players know them. Adapters map these to their own codes. */
export const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;
export type Network = (typeof NETWORKS)[number];

export interface ChargeRequest {
  ref: string; // our PaymentIntent.ref (also the PSP's tx_ref / transfer reference)
  amountPesewas: bigint;
  msisdn: string; // 0XXXXXXXXX
  network: Network;
  direction: "DEPOSIT" | "WITHDRAWAL";
  email: string;
  name?: string | null;
}
export interface ChargeResult {
  providerRef: string | null;
  /** FAILED only when the PSP definitely refused it; an unclear outcome throws instead. */
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  /** Page where the player approves the payment, when the PSP needs one. */
  redirectUrl?: string;
  /** The PSP pushed an approval prompt to the player's phone (USSD code to dial if it doesn't show). */
  prompt?: { ussdFallback: string | null };
}

/** The PSP refused a request outright (bad number, declined...): nothing happened, safe to tell the player. */
export class PspError extends Error {}
export interface NormalisedEvent {
  providerEventId: string;
  ourRef: string; // PaymentIntent.ref this event concerns
  status: "SUCCEEDED" | "FAILED";
  amountPesewas: bigint;
  /** Which kind of payment the PSP says this was; checked against the intent when present. */
  direction?: "DEPOSIT" | "WITHDRAWAL";
}

/** ok:false = not genuinely from the PSP (reject). event:null = genuine but nothing to apply. */
export type WebhookResult = { ok: false } | { ok: true; event: NormalisedEvent | null };

export interface PaymentProvider {
  readonly name: string;
  readonly isSandbox: boolean;
  /** "api": withdrawals are sent through the PSP. "manual": the PSP can't pay players, so an admin pays and records it. */
  readonly payouts: "api" | "manual";
  /** Start a charge (deposit) or payout (withdrawal) with the PSP. */
  initiate(req: ChargeRequest): Promise<ChargeResult>;
  /** Authenticate a webhook and return the normalised event, confirmed with the PSP where it allows. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult>;
}

/** The network a number was issued on, from its prefix. Only a default: numbers can be ported, so players can change it. */
export function guessNetwork(msisdn: string): Network {
  const p = msisdn.slice(0, 3);
  if (p === "020" || p === "050") return "TELECEL";
  if (["026", "027", "056", "057"].includes(p)) return "AIRTELTIGO";
  return "MTN"; // 024, 025, 053, 054, 055, 059
}
