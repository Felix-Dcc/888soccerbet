import { z } from "zod";
import { confirmPassword, requireStaff } from "@/lib/session";
import { clearAdminFinancialHistory } from "@/lib/playerAdmin";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  directions: z.array(z.enum(["WITHDRAWAL", "DEPOSIT"])).min(1),
  password: z.string(),
});

/** Clear an admin account's settled financial history (the transaction-list rows). Any admin; password re-checked. Balances and the ledger are untouched, pending items kept. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireStaff();
    const input = schema.parse(await req.json());
    confirmPassword(actor, input.password);
    const { id } = await params;
    return json({ ok: true, ...(await clearAdminFinancialHistory(actor, id, input.directions, clientIp(req))) });
  } catch (e) {
    return errorResponse(e);
  }
}
