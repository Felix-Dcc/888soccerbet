import { syncFixtures, syncEventMarkets, autoSettleFinished, updateLiveScores } from "@/lib/sync";
import { json, errorResponse } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** One sync+settle tick. Protect with CRON_TOKEN when exposed to an external scheduler. */
export async function POST(req: Request) {
  try {
    const token = process.env.CRON_TOKEN;
    // A signed-in admin (the console's "Run sync + settle") may always run it; schedulers need the token.
    const me = await getCurrentUser();
    const admin = !!me && can(me, "odds.sync");
    if (!admin && token && req.headers.get("x-cron-token") !== token)
      return json({ error: "unauthorised" }, { status: 401 });
    if (!admin && !token && process.env.NODE_ENV === "production")
      return json({ error: "CRON_TOKEN not configured" }, { status: 503 });

    const sync = await syncFixtures();
    const extras = await syncEventMarkets();
    const live = await updateLiveScores();
    const settle = await autoSettleFinished();
    return json({ sync, extras, live, settle });
  } catch (e) {
    return errorResponse(e);
  }
}
