import { dataVersion } from "@/lib/queries";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Polled every few seconds by open pages: tells them whether match data changed. */
export async function GET() {
  try {
    return Response.json({ v: await dataVersion() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
