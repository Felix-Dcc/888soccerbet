import { requirePermission } from "@/lib/session";
import { financialReport } from "@/lib/reporting";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission("reports.view");
    return json(await financialReport());
  } catch (e) {
    return errorResponse(e);
  }
}
