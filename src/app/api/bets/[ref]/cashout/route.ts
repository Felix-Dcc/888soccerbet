import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { cashOut, CashoutError } from "@/lib/cashout";
import { cashoutSchema } from "@/lib/validation";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Cash out all (no amount) or part of one of your bets at the offer you were shown. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const user = await requireUser();
    if (!rateLimit(`cashout:${user.id}`, 20, 60_000).ok) return json({ error: "Slow down a moment", code: "RATE_LIMIT" }, { status: 429 });
    const input = cashoutSchema.parse(await req.json());
    const bet = await prisma.bet.findUnique({ where: { ref: decodeURIComponent((await params).ref) }, select: { id: true, userId: true } });
    if (!bet || bet.userId !== user.id) throw new CashoutError("NOT_FOUND", "Bet not found", 404);
    const cashout = await cashOut({ betId: bet.id, userId: user.id, expected: input.expectedPesewas, amount: input.amountPesewas, idempotencyKey: input.idempotencyKey });
    return json({ cashout });
  } catch (e) {
    return errorResponse(e);
  }
}
