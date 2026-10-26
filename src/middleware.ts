import { NextResponse, type NextRequest } from "next/server";

// Signature headers our payment providers put on webhooks.
const WEBHOOK_HEADERS = ["x-akwapay-signature", "verif-hash", "x-stakra-signature"];

/**
 * A payment webhook registered as just "https://kingzbet.live" (no path) lands on the home page,
 * which answers 200, so the provider never retries and the deposit is never credited. Hand any such
 * POST to the real handler, which checks the signature as usual.
 */
export function middleware(req: NextRequest) {
  if (req.method === "POST" && WEBHOOK_HEADERS.some((h) => req.headers.has(h)))
    return NextResponse.rewrite(new URL("/api/webhooks/payments", req.url));
  return NextResponse.next();
}

export const config = { matcher: "/" };
