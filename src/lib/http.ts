/** API helpers: BigInt-safe JSON, error mapping, client IP. */
import { NextResponse } from "next/server";
import { HttpError } from "./session";
import { BetError } from "./betEngine";
import { WalletError } from "./wallet";
import { AccountError } from "./accounts";
import { BookingError } from "./bookings";
import { SettlementError } from "./settlement";
import { CashoutError } from "./cashout";
import { AdminError } from "./admins";
import { ZodError } from "zod";
import { clientIpFromHeaders } from "./rateLimit";

/** JSON response that serialises bigint as a string (pesewas) instead of throwing. */
export function json(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new NextResponse(body, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof BetError) return json({ error: e.message, code: e.code, data: e.data }, { status: 422 });
  if (e instanceof WalletError) return json({ error: e.message, code: e.code }, { status: 422 });
  if (e instanceof AccountError || e instanceof BookingError || e instanceof SettlementError)
    return json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof CashoutError) return json({ error: e.message, code: e.code, data: e.data }, { status: e.status });
  if (e instanceof AdminError) return json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ZodError) {
    // Surface the first field's own message so forms need no static helper text.
    return json({ error: e.issues[0]?.message ?? "Invalid input", code: "VALIDATION", issues: e.issues }, { status: 400 });
  }
  if (e instanceof SyntaxError && /JSON/.test(e.message)) return json({ error: "Invalid request", code: "BAD_JSON" }, { status: 400 }); // malformed body
  console.error("[api] unhandled:", e);
  return json({ error: "Something went wrong", code: "INTERNAL" }, { status: 500 });
}

export const clientIp = (req: Request) => clientIpFromHeaders(req.headers);
