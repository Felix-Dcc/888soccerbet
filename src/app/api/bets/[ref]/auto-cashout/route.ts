import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { setAutoCashout, removeAutoCashout, CashoutError } from "@/lib/cashout";
import { autoCashoutSchema } from "@/lib/validation";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

async function ownBet(ref: string, userId: string) {
  const bet = await prisma.bet.findUnique({ where: { ref: decodeURIComponent(ref) }, select: { id: true, userId: true } });
  if (!bet || bet.userId !== userId) throw new CashoutError("NOT_FOUND", "Bet not found", 404);
  return bet.id;
}

/** Set or replace the auto cash out target (one rule per bet). */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const user = await requireUser();
    const { targetPesewas } = autoCashoutSchema.parse(await req.json());
    return json({ rule: await setAutoCashout(user.id, await ownBet((await params).ref, user.id), targetPesewas) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Remove the auto cash out rule. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const user = await requireUser();
    await removeAutoCashout(user.id, await ownBet((await params).ref, user.id));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
