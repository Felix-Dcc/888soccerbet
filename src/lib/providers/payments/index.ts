import type { PaymentProvider } from "./types";
import { SandboxMomoProvider } from "./sandboxMomo";

let cached: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  if (cached) return cached;
  // Only the sandbox adapter ships here. A real PSP (Paystack/Hubtel/Flutterwave)
  // requires approved merchant credentials and would be registered below.
  cached = new SandboxMomoProvider();
  return cached;
}

export type { PaymentProvider } from "./types";
