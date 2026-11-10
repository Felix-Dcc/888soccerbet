import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { createAdminInvite } from "@/lib/admins";
import { json, errorResponse, clientIp } from "@/lib/http";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

const schema = z.object({
  role: z.enum(["ADMIN", "SUPER_ADMIN"]),
  adminRoleId: z.string().min(1).nullable().optional(),
  permGrants: z.array(z.string().max(60)).max(50).optional(),
  permDenials: z.array(z.string().max(60)).max(50).optional(),
  // The new admin's commission rate in % (2 decimals), or null for the default rate.
  commissionPct: z
    .number()
    .min(0, "The commission rate can't be below 0%")
    .max(100, "The commission rate can't be above 100%")
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places for the commission rate")
    .nullable()
    .optional(),
  password: z.string().min(1, "Confirm with your password"),
});

/** Generate a single-use invite link (shown once): whoever opens it sets their own email and password. Super admin only. */
export async function POST(req: Request) {
  try {
    const actor = await requirePermission("admins.manage");
    const { password, commissionPct, ...access } = schema.parse(await req.json());
    confirmPassword(actor, password);
    const commissionBp = commissionPct == null ? null : Math.round(commissionPct * 100);
    const { token, expiresAt } = await createAdminInvite(actor, { ...access, commissionBp }, clientIp(req));
    return json({ inviteUrl: `${siteUrl()}/account/invite/${token}`, expiresAt }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
