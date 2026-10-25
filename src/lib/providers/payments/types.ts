/** Payment (Mobile Money) provider contract. Adapters implement this so the PSP is swappable. */
export interface ChargeRequest {
  ref: string; // our PaymentIntent.ref
  amountPesewas: bigint;
  msisdn: string;
  direction: "DEPOSIT" | "WITHDRAWAL";
}
export interface ChargeResult {
  providerRef: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
}
export interface NormalisedEvent {
  providerEventId: string;
  ourRef: string; // PaymentIntent.ref this event concerns
  status: "SUCCEEDED" | "FAILED";
  amountPesewas: bigint;
}

export interface PaymentProvider {
  readonly name: string;
  readonly isSandbox: boolean;
  /** Initiate a charge/payout with the PSP. Returns a provider reference. */
  initiate(req: ChargeRequest): Promise<ChargeResult>;
  /** Verify a webhook signature and return the normalised event, or null if invalid. */
  verifyWebhook(rawBody: string, signature: string | null): NormalisedEvent | null;
}
