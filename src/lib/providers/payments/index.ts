import type { PaymentProvider } from "./types";
import { SandboxMomoProvider } from "./sandboxMomo";
import { FlutterwaveProvider } from "./flutterwave";

let cached: PaymentProvider | null = null;

/**
 * PAYMENT_PROVIDER picks the PSP: "sandbox" (default, no real money) or "flutterwave".
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
  } else if (which === "sandbox") {
    cached = new SandboxMomoProvider();
  } else {
    throw new Error(`Unknown PAYMENT_PROVIDER "${which}"`);
  }
  return cached;
}

export type { PaymentProvider, Network } from "./types";
export { NETWORKS } from "./types";
