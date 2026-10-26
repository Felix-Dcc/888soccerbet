import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { SettlementError, setLiveScore, settleFixture, voidFixture } from "@/lib/settlement";
import { adminSettleSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const AUDIT_ACTION = { result: "SETTLE_FIXTURE", live: "LIVE_SCORE_FIXTURE", void: "VOID_FIXTURE" } as const;

/** Update a live score, settle a match with its final score, or void it (every leg at odds 1.00). */
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
    const result =
      input.action === "void" ? await voidFixture(input.fixtureId)
      : input.action === "live" ? (await setLiveScore(input.fixtureId, input.homeScore, input.awayScore), { betsSettled: 0 })
      : await settleFixture(input.fixtureId, input.homeScore, input.awayScore);
    await audit({ actorUserId: admin.id, action: AUDIT_ACTION[input.action], targetType: "Fixture", targetId: input.fixtureId, after: { ...input, ...result }, ip: clientIp(req) });
    return json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
