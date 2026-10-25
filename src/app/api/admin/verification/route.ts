import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { reviewVerification } from "@/lib/wallet";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().min(1), action: z.enum(["approve", "reject"]) });

/** Approve (release held funds, unlock withdrawals) or reject (release held funds, stay locked). */
export async function POST(req: Request) {
  try {
    const admin = await requirePermission("verification.review");
    const input = schema.parse(await req.json());
    const result = await reviewVerification(input.userId, input.action === "approve");
    await audit({
      actorUserId: admin.id,
      action: input.action === "approve" ? "APPROVE_VERIFICATION" : "REJECT_VERIFICATION",
      targetType: "User",
      targetId: input.userId,
      after: { released: result.released, kycStatus: input.action === "approve" ? "VERIFIED" : "REJECTED" },
      ip: clientIp(req),
    });
    return json({ ok: true, released: result.released });
  } catch (e) {
    return errorResponse(e);
  }
}
