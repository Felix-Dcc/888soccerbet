import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { createManualFixture } from "@/lib/manualFixtures";
import { manualFixtureSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Create a manual game with admin-set odds. */
export async function POST(req: Request) {
  try {
    const admin = await requirePermission("fixtures.manage");
    const input = manualFixtureSchema.parse(await req.json());
    const fixture = await createManualFixture(input);
    await audit({ actorUserId: admin.id, action: "CREATE_MANUAL_FIXTURE", targetType: "Fixture", targetId: fixture.id, after: input, ip: clientIp(req) });
    return json({ ok: true, fixture }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
