import { createBooking } from "@/lib/bookings";
import { getCurrentUser } from "@/lib/session";
import { selectionIdsSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Book a slip. Works signed out (codes are for sharing); creator is recorded when known. */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`book:${clientIp(req) ?? "anon"}`, 20, 60_000).ok)
      return json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
    const { selectionIds } = selectionIdsSchema.parse(await req.json());
    const user = await getCurrentUser();
    const code = await createBooking(selectionIds, user?.id);
    return json({ code }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
