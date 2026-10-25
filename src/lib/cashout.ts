/**
 * Cash out, as sportsbooks run it: settle an open bet now for a price based on how likely it
 * still is to win, in full or in part, by hand or automatically at a target.
 *
 * Pricing: offer = (payout if every live leg wins) / (product of the open legs' CURRENT odds),
 * less the house margin (CASHOUT_MARGIN_PCT, default 5%). Legs already won keep their placed
 * odds, void legs count as 1.00. A leg can only be priced while it is bettable (pre-match on
 * this feed, which has no in-play odds), so cash out pauses while a leg is in play or suspended.
 *
 * Money moves through the ledger like settlement: escrow releases the stake (or the part being
 * cashed), the player is credited the offer, the house P&L takes the difference. The bet row is
 * locked, so a cash out and a settlement (or two cash outs) can never both pay.
 */
import { Prisma, type BetStatus, type SelectionStatus } from "@prisma/client";
import { prisma } from "./db";
import { isBettable } from "./markets";
import { combineMilliOdds, potentialPayout } from "./money";
import { postTransaction, userAccountId, houseAccountId } from "./ledger";

export class CashoutError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public data?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Smallest cash out paid, and the smallest value a partial cash out may leave running. */
export const MIN_CASHOUT = 100n; // GHS 1.00
/** Partial cash outs allowed per bet: singles 10, multiples 5. */
export const partialLimit = (type: string) => (type === "SINGLE" ? 10 : 5);
export const cashoutMarginPct = () => Number(process.env.CASHOUT_MARGIN_PCT ?? "5");
const marginBp = () => BigInt(Math.round(cashoutMarginPct() * 100)); // basis points

export interface QuoteLeg {
  status: SelectionStatus; // this leg on the bet
  milliOddsAtPlacement: number;
  selection: { milliOdds: number; status: SelectionStatus; market: { status: string } };
  fixture: { status: string; startsAt: Date };
}
export type Quote = { available: true; offer: bigint; payoutIfWin: bigint } | { available: false; reason: string };

/** Pure: the cash-out offer for a bet right now, or why there is none. */
export function quoteCashout(bet: { status: BetStatus; stake: bigint }, legs: QuoteLeg[], now = new Date(), margin = marginBp()): Quote {
  if (bet.status !== "PENDING") return { available: false, reason: "Bet settled" };
  if (legs.some((l) => l.status === "LOST")) return { available: false, reason: "Selection lost" };
  const live = legs.filter((l) => l.status !== "VOID");
  const open = legs.filter((l) => l.status === "OPEN");
  if (!live.length || !open.length) return { available: false, reason: "Awaiting results" };
  for (const l of open) {
    if (l.fixture.status === "CANCELLED" || l.fixture.status === "FINISHED") return { available: false, reason: "Awaiting results" };
    if (!isBettable(l.fixture, now)) return { available: false, reason: "Paused, match in play" };
    if (l.selection.status !== "OPEN" || l.selection.market.status !== "OPEN" || l.selection.milliOdds < 1000)
      return { available: false, reason: "Suspended" };
  }
  const payoutIfWin = potentialPayout(bet.stake, combineMilliOdds(live.map((l) => l.milliOddsAtPlacement)));
  let num = payoutIfWin * (10000n - margin);
  let den = 10000n;
  for (const l of open) {
    num *= 1000n;
    den *= BigInt(l.selection.milliOdds);
  }
  let offer = num / den;
  if (offer > payoutIfWin) offer = payoutIfWin;
  if (offer < MIN_CASHOUT) return { available: false, reason: "Below GHS 1.00" };
  return { available: true, offer, payoutIfWin };
}

const legsInclude = {
  selections: {
    select: {
      status: true,
      milliOddsAtPlacement: true,
      selection: { select: { milliOdds: true, status: true, market: { select: { status: true } } } },
      fixture: { select: { status: true, startsAt: true } },
    },
  },
} satisfies Prisma.BetInclude;

/** Current quote for one bet (by id), straight from the database. */
export async function quoteForBet(betId: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<Quote> {
  const bet = await db.bet.findUnique({ where: { id: betId }, include: legsInclude });
  return bet ? quoteCashout(bet, bet.selections) : { available: false, reason: "Not found" };
}

/** Quotes for many bets at once (the My Bets list). */
export async function quotesFor(betIds: string[]): Promise<Map<string, Quote>> {
  const bets = await prisma.bet.findMany({ where: { id: { in: betIds }, status: "PENDING" }, include: legsInclude });
  const now = new Date();
  return new Map(bets.map((b) => [b.id, quoteCashout(b, b.selections, now)]));
}

export interface CashoutRequest {
  betId: string;
  userId: string | null; // null: auto cash out by the system
  expected: bigint; // the offer the player saw; refused if it has moved
  amount?: bigint; // partial: how much of the offer to take (default all)
  idempotencyKey: string;
}

/** Cash out all or part of a bet at the current offer. Idempotent on idempotencyKey. */
export async function cashOut(req: CashoutRequest) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const done = await tx.cashout.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
        if (done) {
          if (done.betId !== req.betId) throw new CashoutError("IDEMPOTENCY_MISMATCH", "This request was already used for another bet", 409);
          return done; // retried request: same result, no second payment
        }

        await tx.$queryRaw`SELECT id FROM "Bet" WHERE id = ${req.betId} FOR UPDATE`;
        const bet = await tx.bet.findUnique({ where: { id: req.betId }, include: { ...legsInclude, cashouts: { select: { full: true } } } });
        if (!bet || (req.userId !== null && bet.userId !== req.userId)) throw new CashoutError("NOT_FOUND", "Bet not found", 404);

        const quote = quoteCashout(bet, bet.selections);
        if (!quote.available) throw new CashoutError("UNAVAILABLE", quote.reason, 409);
        if (quote.offer !== req.expected)
          throw new CashoutError("OFFER_CHANGED", "The cash out value has changed", 409, { offer: quote.offer.toString() });

        const amount = req.amount ?? quote.offer;
        const full = amount === quote.offer;
        if (amount <= 0n || amount > quote.offer) throw new CashoutError("BAD_AMOUNT", "Choose an amount up to the cash out value", 422);
        if (!full) {
          if (amount < MIN_CASHOUT) throw new CashoutError("BAD_AMOUNT", "The minimum cash out is GHS 1.00", 422);
          if (quote.offer - amount < MIN_CASHOUT) throw new CashoutError("BAD_AMOUNT", "Leave at least GHS 1.00 running, or cash out in full", 422);
          if (bet.cashouts.filter((c) => !c.full).length >= partialLimit(bet.type))
            throw new CashoutError("PARTIAL_LIMIT", `Partial cash out is limited to ${partialLimit(bet.type)} times on this bet`, 409);
        }

        // Stake closed by this cash out, in proportion to the share of the offer taken.
        const stakePortion = full ? bet.stake : (bet.stake * amount) / quote.offer;
        if (!full && (stakePortion <= 0n || stakePortion >= bet.stake)) throw new CashoutError("BAD_AMOUNT", "That amount is too small to split off", 422);

        const escrowId = await userAccountId(tx, bet.userId, "BET_ESCROW");
        const cashId = await userAccountId(tx, bet.userId, "USER_CASH");
        const housePnl = await houseAccountId(tx, "HOUSE_PNL");
        await postTransaction(
          tx,
          "CASHOUT",
          `cashout:${req.idempotencyKey}`,
          [
            { accountId: escrowId, amount: -stakePortion }, // release that stake
            { accountId: cashId, amount }, // pay the player
            { accountId: housePnl, amount: stakePortion - amount }, // house keeps/pays the difference
          ],
          { betRef: bet.ref, full: String(full) },
        );

        const remaining = bet.stake - stakePortion;
        await tx.bet.update({
          where: { id: bet.id },
          data: full
            ? // Settles as a win (trophy and all); nothing more is paid at settlement, the player got the cash out.
              { status: "WON", potentialPayout: 0n, settledAt: new Date(), autoCashoutTarget: null, autoCashoutAbove: null }
            : // Manual cash out ends any auto rule (as on other books); the rest keeps its placed odds.
              { stake: remaining, potentialPayout: potentialPayout(remaining, bet.combinedMilliOdds), autoCashoutTarget: null, autoCashoutAbove: null },
        });
        return tx.cashout.create({
          data: { betId: bet.id, amount, stakePortion, full, auto: req.userId === null, idempotencyKey: req.idempotencyKey },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 },
    );
  } catch (e) {
    // Two identical requests at once: the loser hits the unique key; return the winner's result.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const done = await prisma.cashout.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
      if (done) return done;
    }
    throw e;
  }
}

/** Set (or replace) the bet's auto cash out rule at a target value. */
export async function setAutoCashout(userId: string, betId: string, target: bigint) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Bet" WHERE id = ${betId} FOR UPDATE`;
    const bet = await tx.bet.findUnique({ where: { id: betId }, include: legsInclude });
    if (!bet || bet.userId !== userId) throw new CashoutError("NOT_FOUND", "Bet not found", 404);
    const quote = quoteCashout(bet, bet.selections);
    if (!quote.available) throw new CashoutError("UNAVAILABLE", quote.reason, 409);
    if (target < MIN_CASHOUT) throw new CashoutError("BAD_AMOUNT", "The minimum cash out is GHS 1.00", 422);
    if (target > quote.payoutIfWin) throw new CashoutError("BAD_AMOUNT", "The target can't be more than the potential win", 422);
    if (target === quote.offer) throw new CashoutError("BAD_AMOUNT", "That is the current value: use Cash out instead", 422);
    // Above the current offer it locks in profit; below it limits loss.
    const above = target > quote.offer;
    await tx.bet.update({ where: { id: bet.id }, data: { autoCashoutTarget: target, autoCashoutAbove: above } });
    return { target, above, offer: quote.offer };
  });
}

export async function removeAutoCashout(userId: string, betId: string) {
  const r = await prisma.bet.updateMany({ where: { id: betId, userId }, data: { autoCashoutTarget: null, autoCashoutAbove: null } });
  if (!r.count) throw new CashoutError("NOT_FOUND", "Bet not found", 404);
}

/**
 * Fire every auto cash out whose target the offer has reached. Called after prices or results
 * change (odds sync, settlement). A rule waits while the bet can't be priced (in play, suspended).
 */
export async function runAutoCashouts(): Promise<{ checked: number; cashed: number }> {
  const bets = await prisma.bet.findMany({ where: { status: "PENDING", autoCashoutTarget: { not: null } }, include: legsInclude });
  const now = new Date();
  let cashed = 0;
  for (const b of bets) {
    const q = quoteCashout(b, b.selections, now);
    if (!q.available) continue;
    const hit = b.autoCashoutAbove ? q.offer >= b.autoCashoutTarget! : q.offer <= b.autoCashoutTarget!;
    if (!hit) continue;
    try {
      await cashOut({ betId: b.id, userId: null, expected: q.offer, idempotencyKey: `auto:${b.id}` });
      cashed++;
    } catch (e) {
      if (!(e instanceof CashoutError)) throw e; // moved or settled meanwhile: try again next time
    }
  }
  return { checked: bets.length, cashed };
}
