import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { createAdminInvite } from "@/lib/admins";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  role: z.enum(["ADMIN", "SUPER_ADMIN"]),
  adminRoleId: z.string().min(1).nullable().optional(),
  permGrants: z.array(z.string().max(60)).max(50).optional(),
  permDenials: z.array(z.string().max(60)).max(50).optional(),
  password: z.string().min(1, "Confirm with your password"),
});

/** Generate a single-use invite link (shown once): whoever opens it sets their own email and password. Super admin only. */
export async function POST(req: Request) {
  try {
    const actor = await requirePermission("admins.manage");
    const { password, ...access } = schema.parse(await req.json());
    confirmPassword(actor, password);
    const { token, expiresAt } = await createAdminInvite(actor, access, clientIp(req));
    const origin = req.headers.get("origin") ?? new URL(req.url).origin;
    return json({ inviteUrl: `${origin}/account/invite/${token}`, expiresAt }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
