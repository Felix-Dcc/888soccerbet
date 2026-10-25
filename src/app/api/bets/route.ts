import { requireUser } from "@/lib/session";
import { placeBet } from "@/lib/betEngine";
import { placeBetSchema } from "@/lib/validation";
import { json, errorResponse, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`bet:${user.id}`, 30, 60_000).ok)
      return json({ error: "Slow down a moment", code: "RATE_LIMIT" }, { status: 429 });

    const input = placeBetSchema.parse(await req.json());
    const bet = await placeBet(user.id, input);
    return json({ bet }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const bets = await prisma.bet.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: "desc" },
      take: 50,
      include: { selections: true },
    });
    return json({ bets });
  } catch (e) {
    return errorResponse(e);
  }
}
