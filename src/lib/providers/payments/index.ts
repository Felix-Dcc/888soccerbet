import type { PaymentProvider } from "./types";
import { SandboxMomoProvider } from "./sandboxMomo";
import { FlutterwaveProvider } from "./flutterwave";
import { ShinobiPayProvider } from "./shinobipay";

/** Providers that can't pay players: their withdrawals are paid by an admin and recorded by hand. */
export const MANUAL_PAYOUT_PROVIDERS: ReadonlySet<string> = new Set(["shinobipay"]);

let cached: PaymentProvider | null = null;

/**
 * PAYMENT_PROVIDER picks the PSP: "sandbox" (default, no real money), "shinobipay" or "flutterwave".
 * Flutterwave without its keys is a hard error, never a silent fall back to the sandbox:
 * a sandbox in production would let players confirm their own fake deposits.
 */
export function paymentProvider(): PaymentProvider {
  if (cached) return cached;
  const which = process.env.PAYMENT_PROVIDER || "sandbox";
  if (which === "flutterwave") {
    const key = process.env.FLW_SECRET_KEY;
    const hash = process.env.FLW_SECRET_HASH;
    if (!key || !hash) throw new Error("PAYMENT_PROVIDER=flutterwave needs FLW_SECRET_KEY and FLW_SECRET_HASH");
    cached = new FlutterwaveProvider(key, hash);
  } else if (which === "shinobipay") {
    const key = process.env.SHINOBI_SECRET_KEY;
    const secret = process.env.SHINOBI_WEBHOOK_SECRET;
    if (!key || !secret) throw new Error("PAYMENT_PROVIDER=shinobipay needs SHINOBI_SECRET_KEY and SHINOBI_WEBHOOK_SECRET");
    cached = new ShinobiPayProvider(key, secret);
  } else if (which === "sandbox") {
    cached = new SandboxMomoProvider();
  } else {
    throw new Error(`Unknown PAYMENT_PROVIDER "${which}"`);
  }
  return cached;
}

export type { PaymentProvider, Network } from "./types";
export { NETWORKS } from "./types";
