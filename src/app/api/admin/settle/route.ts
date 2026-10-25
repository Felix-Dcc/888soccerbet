import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { SettlementError, settleFixture, voidFixture } from "@/lib/settlement";
import { adminSettleSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Settle a match with its final score, or void it (cancelled/abandoned: every leg at odds 1.00). */
export async function POST(req: Request) {
  try {
    const admin = await requirePermission("settlement.manage");
    const input = adminSettleSchema.parse(await req.json());
    if (input.action === "result") {
      // A final score can only exist once the match has started; voiding (cancellation) is allowed any time.
      const f = await prisma.fixture.findUnique({ where: { id: input.fixtureId }, select: { startsAt: true } });
      if (!f) throw new SettlementError("NOT_FOUND", "Match not found", 404);
      if (f.startsAt > new Date()) throw new SettlementError("NOT_STARTED", "This match hasn't kicked off yet — it can only be voided", 409);
    }
    const result = input.action === "void" ? await voidFixture(input.fixtureId) : await settleFixture(input.fixtureId, input.homeScore, input.awayScore);
    await audit({
      actorUserId: admin.id,
      action: input.action === "void" ? "VOID_FIXTURE" : "SETTLE_FIXTURE",
      targetType: "Fixture",
      targetId: input.fixtureId,
      after: { ...input, ...result },
      ip: clientIp(req),
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
