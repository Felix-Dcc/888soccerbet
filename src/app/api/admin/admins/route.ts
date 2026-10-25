import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { createAdmin } from "@/lib/admins";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email("Enter a valid email").max(200).transform((s) => s.toLowerCase().trim()),
  displayName: z.string().trim().min(2, "Enter their name").max(60),
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{3,24}$/, "Username: 3-24 letters, numbers, . _ -")
    .transform((s) => s.toLowerCase()),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]),
  adminRoleId: z.string().min(1).nullable().optional(),
  permGrants: z.array(z.string().max(60)).max(50).optional(),
  permDenials: z.array(z.string().max(60)).max(50).optional(),
  password: z.string().min(1, "Confirm with your password"),
});

/** Create an administrator; returns a single-use setup link for them (shown once). Super admin only. */
export async function POST(req: Request) {
  try {
    const actor = await requirePermission("admins.manage");
    const { password, ...input } = schema.parse(await req.json());
    confirmPassword(actor, password);
    const { user, token } = await createAdmin(actor, input, clientIp(req));
    const origin = req.headers.get("origin") ?? new URL(req.url).origin;
    return json({ id: user.id, setupUrl: `${origin}/account/setup/${token}` }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
