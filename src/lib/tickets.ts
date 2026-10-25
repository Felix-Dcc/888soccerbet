/** Bet tickets as shown to their owner and on the public verification page. */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { verifyCode as newVerifyCode, normaliseCode } from "./ids";

const ticketInclude = {
  cashouts: { orderBy: { createdAt: "asc" }, select: { id: true, amount: true, stakePortion: true, full: true, auto: true, createdAt: true } },
  selections: {
    orderBy: { id: "asc" },
    include: {
      fixture: { select: { id: true, homeTeam: true, awayTeam: true, startsAt: true, status: true, homeScore: true, awayScore: true } },
      selection: { select: { market: { select: { selections: { select: { name: true, status: true } } } } } },
    },
  },
} satisfies Prisma.BetInclude;

export type Ticket = Prisma.BetGetPayload<{ include: typeof ticketInclude }>;

export const ticketByRef = (ref: string) => prisma.bet.findUnique({ where: { ref }, include: ticketInclude });

/**
 * Public lookup, settled tickets only: a running bet's code doesn't verify until it has a result.
 * Codes are typed by hand, so case, spaces and dashes don't matter.
 */
export const ticketByVerifyCode = (raw: string) => {
  const code = normaliseCode(raw).slice(0, 32);
  return code ? prisma.bet.findFirst({ where: { verifyCode: code, status: { not: "PENDING" } }, include: ticketInclude }) : Promise.resolve(null);
};

/** Bets placed before verification codes existed get one the first time their owner opens them. */
export async function ensureVerifyCode(bet: { id: string; verifyCode: string | null }): Promise<string> {
  if (bet.verifyCode) return bet.verifyCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newVerifyCode();
    try {
      const r = await prisma.bet.updateMany({ where: { id: bet.id, verifyCode: null }, data: { verifyCode: code } });
      if (r.count) return code;
      return (await prisma.bet.findUniqueOrThrow({ where: { id: bet.id }, select: { verifyCode: true } })).verifyCode!; // set concurrently
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // code collision: try another
    }
  }
  throw new Error("Could not assign a verification code");
}

/** What a settled leg's market actually resulted in: the winning selection(s), or Void. */
export const legOutcome = (leg: Ticket["selections"][number]) =>
  leg.status === "VOID" ? "Void" : leg.selection.market.selections.filter((s) => s.status === "WON").map((s) => s.name).join(", ") || "Void";

/**
 * Money on a ticket, cash outs included. bet.stake is what is still running after partial cash
 * outs, so the stake placed is that plus the parts cashed out. ret is the total returned to the
 * player (null while the bet is running).
 */
export function ticketTotals(bet: { status: string; stake: bigint; potentialPayout: bigint; cashouts: { amount: bigint; stakePortion: bigint; full: boolean }[] }) {
  const cashed = bet.cashouts.reduce((n, c) => n + c.amount, 0n);
  const placedStake = bet.stake + bet.cashouts.filter((c) => !c.full).reduce((n, c) => n + c.stakePortion, 0n);
  const ret =
    bet.status === "WON" || bet.status === "VOID" ? bet.potentialPayout + cashed : bet.status === "PENDING" ? null : cashed; // LOST, REJECTED
  return { cashed, placedStake, ret };
}
