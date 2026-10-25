import { z } from "zod";
import { getCurrentUser, requireUser } from "@/lib/session";
import { markWinsSeen, unseenWins } from "@/lib/wins";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Winning bets the player hasn't been shown a "You won" pop-up for yet (none when signed out). */
export async function GET() {
  try {
    // Signed-out visitors simply have no wins: answering 200 keeps their console free of 401 noise.
    const user = await getCurrentUser();
    return json({ wins: user ? await unseenWins(user.id) : [] });
  } catch (e) {
    return errorResponse(e);
  }
}

const seenSchema = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(20) });

/** Mark pop-ups as seen once the player closes them. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { ids } = seenSchema.parse(await req.json());
    return json({ updated: await markWinsSeen(user.id, ids) });
  } catch (e) {
    return errorResponse(e);
  }
}
