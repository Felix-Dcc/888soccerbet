import { loadBooking } from "@/lib/bookings";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Resolve a booking code to its selections at current odds. Rate-limited against code guessing. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    if (!rateLimit(`bookload:${clientIp(req) ?? "anon"}`, 30, 60_000).ok)
      return json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
    const { code } = await params;
    if (code.length > 20) return json({ error: "Booking code not found", code: "BOOKING_NOT_FOUND" }, { status: 404 });
    return json(await loadBooking(code));
  } catch (e) {
    return errorResponse(e);
  }
}
