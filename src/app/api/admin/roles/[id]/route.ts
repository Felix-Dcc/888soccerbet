import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { deleteRole, saveRole } from "@/lib/admins";
import { roleSchema } from "@/lib/roleSchema";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Edit a custom role. Super admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("roles.manage");
    const { password, ...input } = roleSchema.parse(await req.json());
    confirmPassword(actor, password);
    return json({ role: await saveRole(actor, { ...input, id: (await params).id }, clientIp(req)) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Delete a custom role that no admin uses any more. Super admin only. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("roles.manage");
    confirmPassword(actor, z.object({ password: z.string() }).parse(await req.json()).password);
    await deleteRole(actor, (await params).id, clientIp(req));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
