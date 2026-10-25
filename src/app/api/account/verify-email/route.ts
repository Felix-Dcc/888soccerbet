import { z } from "zod";
import { requireUser } from "@/lib/session";
import { confirmEmailCode } from "@/lib/emailFlows";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().min(1, "Enter the 6-digit code").max(20) });

/** The player types the code we emailed them. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { code } = schema.parse(await req.json());
    await confirmEmailCode(user.id, code);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
