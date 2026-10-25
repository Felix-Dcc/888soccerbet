import { resolvePicks } from "@/lib/bookings";
import { selectionIdsSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Revalidate a betslip kept in the browser: current odds for open legs, closed legs dropped. */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`slip:${clientIp(req) ?? "anon"}`, 60, 60_000).ok)
      return json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
    const { selectionIds } = selectionIdsSchema.parse(await req.json());
    return json(await resolvePicks(selectionIds));
  } catch (e) {
    return errorResponse(e);
  }
}
