import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { issueResetLink, promoteToAdmin, removeAdmin, setAdminStatus, updateAdminAccess, updateAdminProfile } from "@/lib/admins";
import { json, errorResponse, clientIp } from "@/lib/http";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

const perms = z.array(z.string().max(60)).max(50);
const username = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_.-]{3,24}$/, "Username: 3-24 letters, numbers, . _ -")
  .transform((s) => s.toLowerCase());
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("access"),
    role: z.enum(["ADMIN", "SUPER_ADMIN"]).optional(),
    adminRoleId: z.string().min(1).nullable().optional(),
    permGrants: perms.optional(),
    permDenials: perms.optional(),
    password: z.string(),
  }),
  z.object({ action: z.literal("status"), status: z.enum(["ACTIVE", "SUSPENDED"]), password: z.string() }),
  z.object({ action: z.literal("profile"), displayName: z.string().trim().min(2).max(60).optional(), username: username.optional(), password: z.string() }),
  z.object({ action: z.literal("reset"), password: z.string() }),
  z.object({ action: z.literal("remove"), password: z.string() }),
  z.object({ action: z.literal("promote"), role: z.enum(["ADMIN", "SUPER_ADMIN"]), adminRoleId: z.string().min(1).nullable().optional(), password: z.string() }),
]);

/** Change an administrator's access, status or profile, issue a reset link, remove them, or make a player one. Super admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("admins.manage");
    const input = schema.parse(await req.json());
    confirmPassword(actor, input.password);
    const { id } = await params;
    const ip = clientIp(req);
    if (input.action === "access") {
      await updateAdminAccess(actor, id, { role: input.role, adminRoleId: input.adminRoleId, permGrants: input.permGrants, permDenials: input.permDenials }, ip);
      return json({ ok: true });
    }
    if (input.action === "promote") {
      await promoteToAdmin(actor, id, { role: input.role, adminRoleId: input.adminRoleId }, ip);
      return json({ ok: true });
    }
    if (input.action === "remove") return json({ ok: true, status: (await removeAdmin(actor, id, ip)).status });
    if (input.action === "status") return json({ ok: true, status: (await setAdminStatus(actor, id, input.status, ip)).status });
    if (input.action === "profile") {
      await updateAdminProfile(actor, id, { displayName: input.displayName, username: input.username }, ip);
      return json({ ok: true });
    }
    const token = await issueResetLink(actor, id, ip);
    return json({ ok: true, resetUrl: `${siteUrl()}/account/setup/${token}` });
  } catch (e) {
    return errorResponse(e);
  }
}
