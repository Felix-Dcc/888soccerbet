/**
 * "You won" pop-ups: winning bets the player hasn't been shown yet. Only recent wins qualify,
 * so a player returning after weeks isn't met by a stack of old celebrations.
 */
import { prisma } from "./db";
import { ensureVerifyCode } from "./tickets";

const RECENT_MS = 7 * 86_400_000;
const MAX = 5;
// "You beat X% of winners": compared with every win settled in this window, and only once there
// are enough of them for the figure to mean something.
const RANK_WINDOW_MS = 30 * 86_400_000;
const RANK_MIN_SAMPLE = 20;

export interface UnseenWin {
  id: string;
  ref: string;
  type: string;
  payout: bigint; // pesewas actually paid: settlement payout plus any cash outs
  legs: number;
  settledAt: string;
  verifyCode: string;
  beatPct: number | null; // share of recent wins this one paid more than; null when too few to compare
}

export async function unseenWins(userId: string): Promise<UnseenWin[]> {
  const bets = await prisma.bet.findMany({
    where: { userId, status: "WON", winSeenAt: null, settledAt: { gte: new Date(Date.now() - RECENT_MS) } },
    orderBy: { settledAt: "asc" }, // oldest first: the pop-ups play in the order the wins landed
    take: MAX,
    select: {
      id: true,
      ref: true,
      type: true,
      potentialPayout: true,
      settledAt: true,
      verifyCode: true,
      cashouts: { select: { amount: true } },
      _count: { select: { selections: true } },
    },
  });
  if (!bets.length) return [];
  const recent = { status: "WON" as const, settledAt: { gte: new Date(Date.now() - RANK_WINDOW_MS) } };
  const sample = await prisma.bet.count({ where: recent });
  return Promise.all(
    bets.map(async (b) => ({
      id: b.id,
      ref: b.ref,
      type: b.type,
      payout: b.potentialPayout + b.cashouts.reduce((n, c) => n + c.amount, 0n), // a cash out is part of what was won
      legs: b._count.selections,
      settledAt: b.settledAt!.toISOString(),
      verifyCode: await ensureVerifyCode(b),
      beatPct:
        sample < RANK_MIN_SAMPLE
          ? null
          : Math.floor(((await prisma.bet.count({ where: { ...recent, potentialPayout: { lt: b.potentialPayout } } })) * 100) / sample),
    })),
  );
}

/** Record that the player dismissed these pop-ups. Scoped to the player's own winning bets. */
export async function markWinsSeen(userId: string, ids: string[]): Promise<number> {
  const r = await prisma.bet.updateMany({ where: { id: { in: ids }, userId, status: "WON", winSeenAt: null }, data: { winSeenAt: new Date() } });
  return r.count;
}
