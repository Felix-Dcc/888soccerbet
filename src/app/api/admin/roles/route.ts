import { confirmPassword, requirePermission } from "@/lib/session";
import { saveRole } from "@/lib/admins";
import { roleSchema } from "@/lib/roleSchema";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Create a custom role (a named permission set). Super admin only. */
export async function POST(req: Request) {
  try {
    const actor = await requirePermission("roles.manage");
    const { password, ...input } = roleSchema.parse(await req.json());
    confirmPassword(actor, password);
    return json({ role: await saveRole(actor, input, clientIp(req)) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
