import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { createManualFixture, rescheduleManualFixture } from "@/lib/manualFixtures";
import { generateMatch } from "@/lib/matchGenerator";
import { manualFixtureSchema, rescheduleFixtureSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Create a manual game with admin-set odds, or a random fictional one when { generate: true }. */
export async function POST(req: Request) {
  try {
    const admin = await requirePermission("fixtures.manage");
    const body = await req.json();
    // Generated server-side so the browser can't pick the teams or prices; validated like any manual game.
    const input = body?.generate === true ? manualFixtureSchema.parse(generateMatch()) : manualFixtureSchema.parse(body);
    const fixture = await createManualFixture(input);
    await audit({ actorUserId: admin.id, action: body?.generate === true ? "GENERATE_FIXTURE" : "CREATE_MANUAL_FIXTURE", targetType: "Fixture", targetId: fixture.id, after: input, ip: clientIp(req) });
    return json({ ok: true, fixture, generated: body?.generate === true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Move a manual/generated game's kick-off time. */
export async function PATCH(req: Request) {
  try {
    const admin = await requirePermission("fixtures.manage");
    const input = rescheduleFixtureSchema.parse(await req.json());
    if (!(await rescheduleManualFixture(input.fixtureId, input.startsAt)))
      return json({ error: "Match not found, already settled, or not a manual game", code: "NOT_RESCHEDULABLE" }, { status: 409 });
    await audit({ actorUserId: admin.id, action: "RESCHEDULE_FIXTURE", targetType: "Fixture", targetId: input.fixtureId, after: { startsAt: input.startsAt }, ip: clientIp(req) });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
