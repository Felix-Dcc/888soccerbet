import type { PaymentProvider } from "./types";
import { SandboxMomoProvider } from "./sandboxMomo";
import { FlutterwaveProvider } from "./flutterwave";
import { ShinobiPayProvider } from "./shinobipay";
import { FlutterwaveNgProvider } from "./flutterwaveNg";
import { NG_BANK_PROVIDER } from "../../nigeria";

/** Providers that can't pay players: their withdrawals are paid by an admin and recorded by hand. */
export const MANUAL_PAYOUT_PROVIDERS: ReadonlySet<string> = new Set(["shinobipay", NG_BANK_PROVIDER]);

let cached: PaymentProvider | null = null;

/** Keys never contain whitespace; one pasted across two lines in a dashboard must not break every request (or leak into error logs). */
const secret = (name: string) => process.env[name]?.replace(/\s+/g, "") || undefined;

/**
 * PAYMENT_PROVIDER picks the PSP: "sandbox" (default, no real money), "shinobipay" or "flutterwave".
 * Flutterwave without its keys is a hard error, never a silent fall back to the sandbox:
 * a sandbox in production would let players confirm their own fake deposits.
 */
export function paymentProvider(): PaymentProvider {
  if (cached) return cached;
  const which = process.env.PAYMENT_PROVIDER || "sandbox";
  if (which === "flutterwave") {
    const key = secret("FLW_SECRET_KEY");
    const hash = secret("FLW_SECRET_HASH");
    if (!key || !hash) throw new Error("PAYMENT_PROVIDER=flutterwave needs FLW_SECRET_KEY and FLW_SECRET_HASH");
    cached = new FlutterwaveProvider(key, hash);
  } else if (which === "shinobipay") {
    const key = secret("SHINOBI_SECRET_KEY");
    const webhookSecret = secret("SHINOBI_WEBHOOK_SECRET");
    if (!key || !webhookSecret) throw new Error("PAYMENT_PROVIDER=shinobipay needs SHINOBI_SECRET_KEY and SHINOBI_WEBHOOK_SECRET");
    cached = new ShinobiPayProvider(key, webhookSecret);
  } else if (which === "sandbox") {
    cached = new SandboxMomoProvider();
  } else {
    throw new Error(`Unknown PAYMENT_PROVIDER "${which}"`);
  }
  return cached;
}

let ngCached: PaymentProvider | null | undefined;

/**
 * Deposits of Nigerian players: Flutterwave's Naira checkout once FLW_SECRET_KEY and FLW_SECRET_HASH are
 * set; the sandbox on a sandbox site (no real money); otherwise null, and Nigerians can't pay in yet.
 */
export function ngDepositProvider(): PaymentProvider | null {
  if (ngCached !== undefined) return ngCached;
  const key = secret("FLW_SECRET_KEY");
  const hash = secret("FLW_SECRET_HASH");
  if (key && hash) ngCached = new FlutterwaveNgProvider(key, hash);
  else ngCached = (process.env.PAYMENT_PROVIDER || "sandbox") === "sandbox" ? paymentProvider() : null;
  return ngCached;
}

export type { PaymentProvider, Network } from "./types";
export { NETWORKS } from "./types";
