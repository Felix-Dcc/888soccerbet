import { z } from "zod";
import { confirmPassword, HttpError, requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { decidePayoutRequest, recordPayout, requestPayout, setAdminRate, setDefaultRate } from "@/lib/commission";
import { toPesewas } from "@/lib/money";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

// A percentage with at most 2 decimals, as whole basis points (12.5% -> 1250).
const pct = z
  .number()
  .min(0, "The rate can't be below 0%")
  .max(100, "The rate can't be above 100%")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places")
  .transform((n) => Math.round(n * 100));
const amountGhs = z
  .number()
  .refine((n) => Number.isFinite(n) && n > 0 && n <= 10_000_000, "Enter an amount above zero")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places");

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("default"), ratePct: pct, password: z.string() }),
  z.object({ action: z.literal("rate"), adminId: z.string().min(1), ratePct: pct.nullable(), password: z.string() }),
  z.object({
    action: z.literal("payout"),
    adminId: z.string().min(1),
    amountGhs,
    note: z.string().trim().max(300).optional(),
    idempotencyKey: z.string().min(8).max(100),
    password: z.string(),
  }),
  z.object({ action: z.literal("request"), amountGhs, note: z.string().trim().min(3, "Say where to pay you, e.g. your MoMo number").max(200), password: z.string() }),
  z.object({ action: z.literal("approve"), requestId: z.string().min(1), password: z.string() }),
  z.object({ action: z.literal("reject"), requestId: z.string().min(1), reason: z.string().trim().min(3, "Give a reason for rejecting").max(300), password: z.string() }),
]);

/**
 * Commission actions. Any admin who can see their commission may request a payout of what they are
 * owed; setting rates, recording payouts and approving or rejecting requests are super admin only.
 */
export async function POST(req: Request) {
  try {
    const actor = await requirePermission("commission.view"); // super admins hold it too
    const input = schema.parse(await req.json());
    if (input.action !== "request" && !can(actor, "admins.manage")) throw new HttpError(403, "forbidden");
    confirmPassword(actor, input.password);
    const ip = clientIp(req);
    switch (input.action) {
      case "default":
        await setDefaultRate(actor, input.ratePct, ip);
        return json({ ok: true });
      case "rate":
        await setAdminRate(actor, input.adminId, input.ratePct, ip);
        return json({ ok: true });
      case "payout":
        return json({ ok: true, ...(await recordPayout(actor, input.adminId, toPesewas(input.amountGhs), input.note || null, input.idempotencyKey, ip)) });
      case "request":
        await requestPayout(actor, toPesewas(input.amountGhs), input.note, ip);
        return json({ ok: true }, { status: 201 });
      case "approve":
      case "reject":
        return json({ ok: true, ...(await decidePayoutRequest(actor, input.requestId, input.action === "approve", input.action === "reject" ? input.reason : null, ip)) });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
