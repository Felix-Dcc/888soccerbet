import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { reviewVerification, reviewNttCompliance } from "@/lib/wallet";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().min(1), action: z.enum(["approve", "reject"]), stage: z.enum(["kyc", "ntt"]).default("kyc") });

export async function POST(req: Request) {
  try {
    const admin = await requirePermission("verification.review");
    const input = schema.parse(await req.json());
    const approve = input.action === "approve";
    const result = input.stage === "ntt"
      ? await reviewNttCompliance(input.userId, approve)
      : await reviewVerification(input.userId, approve);
    await audit({
      actorUserId: admin.id,
      action: approve ? "APPROVE_VERIFICATION" : "REJECT_VERIFICATION",
      targetType: "User",
      targetId: input.userId,
      after: { released: result.released, nextStatus: result.nextStatus, stage: input.stage },
      ip: clientIp(req),
    });
    return json({ ok: true, released: result.released, nextStatus: result.nextStatus });
  } catch (e) {
    return errorResponse(e);
  }
}
