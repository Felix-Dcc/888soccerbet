import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { recordPayout, setAdminRate, setDefaultRate } from "@/lib/commission";
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

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("default"), ratePct: pct, password: z.string() }),
  z.object({ action: z.literal("rate"), adminId: z.string().min(1), ratePct: pct.nullable(), password: z.string() }),
  z.object({
    action: z.literal("payout"),
    adminId: z.string().min(1),
    amountGhs: z.number().refine((n) => Number.isFinite(n) && n > 0 && n <= 10_000_000, "Enter an amount above zero"),
    note: z.string().trim().max(300).optional(),
    idempotencyKey: z.string().min(8).max(100),
    password: z.string(),
  }),
]);

/** Super admin: set the default or one admin's commission rate, or record a commission payout. */
export async function POST(req: Request) {
  try {
    const actor = await requirePermission("admins.manage");
    const input = schema.parse(await req.json());
    confirmPassword(actor, input.password);
    const ip = clientIp(req);
    if (input.action === "default") await setDefaultRate(actor, input.ratePct, ip);
    else if (input.action === "rate") await setAdminRate(actor, input.adminId, input.ratePct, ip);
    else return json({ ok: true, ...(await recordPayout(actor, input.adminId, toPesewas(input.amountGhs), input.note || null, input.idempotencyKey, ip)) });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
