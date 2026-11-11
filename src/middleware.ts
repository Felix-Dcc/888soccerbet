import { NextResponse, type NextRequest } from "next/server";

// Signature headers our payment providers put on webhooks.
const WEBHOOK_HEADERS = ["x-akwapay-signature", "verif-hash", "x-sb-signature"];

/**
 * A payment webhook registered as just "https://888soccerbet.com" (no path) lands on the home page,
 * which answers 200, so the provider never retries and the deposit is never credited. Hand any such
 * POST to the real handler, which checks the signature as usual.
 */
export function middleware(req: NextRequest) {
  if (req.method === "POST" && WEBHOOK_HEADERS.some((h) => req.headers.has(h)))
    return NextResponse.rewrite(new URL(req.headers.has("verif-hash") ? "/api/webhooks/flutterwave" : "/api/webhooks/payments", req.url));
  return NextResponse.next();
}

export const config = { matcher: "/" };
