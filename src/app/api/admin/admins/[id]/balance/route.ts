import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { adjustAdminBalance } from "@/lib/playerAdmin";
import { toPesewas } from "@/lib/money";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  amountGhs: z.number().refine((n) => Number.isFinite(n) && n !== 0 && Math.abs(n) <= 100_000, "Enter an amount up to GHS 100,000"),
  reason: z.string().trim().min(5, "Explain the adjustment").max(300),
  idempotencyKey: z.string().min(8).max(100),
  password: z.string(),
});

/** Credit or debit an administrator's own cash balance. Gated by wallets.adjust; the change is in the audit log. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("wallets.adjust");
    const input = schema.parse(await req.json());
    confirmPassword(actor, input.password);
    const { id } = await params;
    return json({ ok: true, ...(await adjustAdminBalance(actor, id, toPesewas(input.amountGhs), input.reason, input.idempotencyKey, clientIp(req))) });
  } catch (e) {
    return errorResponse(e);
  }
}
