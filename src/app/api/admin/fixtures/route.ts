import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { createManualFixture, rescheduleManualFixture } from "@/lib/manualFixtures";
import { generateMatch, generateScoreline } from "@/lib/matchGenerator";
import { buildScript } from "@/lib/scriptedMatches";
import { generateFixtureSchema, manualFixtureSchema, rescheduleFixtureSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Create a manual game with admin-set odds, or a random fictional one when { generate: true }. */
export async function POST(req: Request) {
  try {
    const admin = await requirePermission("fixtures.manage");
    const body = await req.json();
    if (body?.generate !== true) {
      const input = manualFixtureSchema.parse(body);
      const fixture = await createManualFixture(input);
      await audit({ actorUserId: admin.id, action: "CREATE_MANUAL_FIXTURE", targetType: "Fixture", targetId: fixture.id, after: input, ip: clientIp(req) });
      return json({ ok: true, fixture }, { status: 201 });
    }
    // Teams, competition and prices are invented server-side; the admin only chooses the sport and
    // the scoreline it should finish on, which the worker then plays out live.
    const g = generateFixtureSchema.parse(body);
    const sport = g.sportKey ?? (Math.random() < 0.8 ? "football" : "basketball");
    const s = g.scoreline;
    const { ht, ft } = s ? { ht: [s.htHome, s.htAway] as [number, number], ft: [s.ftHome, s.ftAway] as [number, number] } : generateScoreline(sport);
    const input = manualFixtureSchema.parse(generateMatch(sport));
    const fixture = await createManualFixture(input, buildScript(sport, ht, ft));
    await audit({ actorUserId: admin.id, action: "GENERATE_FIXTURE", targetType: "Fixture", targetId: fixture.id, after: { ...input, ht, ft }, ip: clientIp(req) });
    return json({ ok: true, fixture, generated: true, ht, ft, teams: `${input.homeTeam} v ${input.awayTeam}` }, { status: 201 });
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
