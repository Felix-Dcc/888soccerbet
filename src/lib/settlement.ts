/**
 * Settlement. Grading is a pure function (unit-tested). Paying out is idempotent and
 * balanced: the bet-settlement ledger transaction uses a unique reference, so a retry
 * or a concurrent settle can never pay a bet twice.
 */
import { Prisma, type MarketType, type SelectionStatus } from "@prisma/client";
import { prisma } from "./db";
import { postTransaction, userAccountId, houseAccountId } from "./ledger";
import { combineMilliOdds, potentialPayout } from "./money";
import { CORRECT_SCORE_MAX } from "./markets";
import { runAutoCashouts } from "./cashout";
import { notifyWin } from "./emailFlows";

/** A settlement request that can't apply (e.g. the match already has a final result). */
export class SettlementError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
  }
}

/** Grade one selection given the final score. Returns WON / LOST / VOID. */
export function grade(
  type: MarketType,
  code: string,
  line: number | null,
  home: number,
  away: number,
): Extract<SelectionStatus, "WON" | "LOST" | "VOID"> {
  const total = home + away;
  // Over/under on any count: whole lines push (stake back) when the count lands on the line.
  const overUnder = (count: number) => {
    if (line === null) return "VOID";
    if (count === line) return "VOID";
    if (code === "OVER") return count > line ? "WON" : "LOST";
    if (code === "UNDER") return count < line ? "WON" : "LOST";
    return "VOID";
  };
  switch (type) {
    case "MATCH_RESULT":
      if (code === "1") return home > away ? "WON" : "LOST";
      if (code === "X") return home === away ? "WON" : "LOST";
      if (code === "2") return away > home ? "WON" : "LOST";
      return "VOID";
    case "MONEYLINE":
      if (home === away) return "VOID"; // overtime decides a real game; sandbox may tie
      if (code === "1") return home > away ? "WON" : "LOST";
      if (code === "2") return away > home ? "WON" : "LOST";
      return "VOID";
    case "DOUBLE_CHANCE":
      if (code === "1X") return home >= away ? "WON" : "LOST";
      if (code === "12") return home !== away ? "WON" : "LOST";
      if (code === "X2") return away >= home ? "WON" : "LOST";
      return "VOID";
    case "OVER_UNDER":
    case "ALT_TOTAL":
      return overUnder(total);
    case "HOME_TOTAL":
      return overUnder(home);
    case "AWAY_TOTAL":
      return overUnder(away);
    case "CORRECT_SCORE": {
      if (code === "OTHER") return home > CORRECT_SCORE_MAX || away > CORRECT_SCORE_MAX ? "WON" : "LOST";
      const m = /^(\d+)-(\d+)$/.exec(code);
      if (!m) return "VOID";
      return Number(m[1]) === home && Number(m[2]) === away ? "WON" : "LOST";
    }
    case "ODD_EVEN":
      if (code === "ODD") return total % 2 === 1 ? "WON" : "LOST";
      if (code === "EVEN") return total % 2 === 0 ? "WON" : "LOST";
      return "VOID";
    case "HANDICAP":
    case "ALT_HANDICAP": {
      // line = home handicap (away gets -line). Only whole/half lines are offered, so a level
      // adjusted score (possible on whole lines) is a push: stake returned.
      if (line === null) return "VOID";
      const margin = home + line - away;
      if (margin === 0) return "VOID";
      if (code === "1") return margin > 0 ? "WON" : "LOST";
      if (code === "2") return margin < 0 ? "WON" : "LOST";
      return "VOID";
    }
    case "DRAW_NO_BET":
      if (home === away) return "VOID"; // stake returned on a draw
      if (code === "1") return home > away ? "WON" : "LOST";
      if (code === "2") return away > home ? "WON" : "LOST";
      return "VOID";
    case "BTTS": {
      const both = home > 0 && away > 0;
      if (code === "BTTS_YES") return both ? "WON" : "LOST";
      if (code === "BTTS_NO") return both ? "LOST" : "WON";
      return "VOID";
    }
    default:
      return "VOID";
  }
}

/** Record a fixture result and grade all its markets/selections. Then settle affected bets. */
export async function settleFixture(fixtureId: string, homeScore: number, awayScore: number): Promise<{ betsSettled: number }> {
  await prisma.$transaction(async (tx) => {
    // Lock the fixture row so two settlements (admin + feed) can't interleave.
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const fixture = await tx.fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      include: { markets: { include: { selections: true } } },
    });
    // A result is final: re-settling would overwrite the score without regrading paid bets.
    if (fixture.status === "FINISHED" || fixture.status === "CANCELLED")
      throw new SettlementError("ALREADY_SETTLED", `This match is already ${fixture.status === "FINISHED" ? "settled" : "void"}`);
    for (const market of fixture.markets) {
      if (market.status === "SETTLED") continue;
      for (const sel of market.selections) {
        const result = grade(market.type, sel.code, market.line ? Number(market.line) : null, homeScore, awayScore);
        await tx.selection.update({ where: { id: sel.id }, data: { status: result } });
        await tx.betSelection.updateMany({ where: { selectionId: sel.id, status: "OPEN" }, data: { status: result } });
      }
      await tx.market.update({ where: { id: market.id }, data: { status: "SETTLED" } });
    }
    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "FINISHED", homeScore, awayScore, lastSyncedAt: new Date() },
    });
  });

  const betsSettled = await settleAffectedBets(fixtureId);
  await runAutoCashouts(); // a won leg lifts the offer on the multiples still running
  return { betsSettled };
}

/**
 * Update the running score of a live match without settling it (manual/generated games the feed
 * can't score). Sets status LIVE so it behaves like a feed game in play; bets are graded only later
 * by settleFixture. The fixture's updatedAt bump makes players' pages refresh within seconds.
 */
export async function setLiveScore(fixtureId: string, homeScore: number, awayScore: number): Promise<void> {
  const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId }, select: { status: true, startsAt: true } });
  if (!fixture) throw new SettlementError("NOT_FOUND", "Match not found", 404);
  if (fixture.status === "FINISHED" || fixture.status === "CANCELLED")
    throw new SettlementError("ALREADY_SETTLED", `This match is already ${fixture.status === "FINISHED" ? "settled" : "void"}`);
  if (fixture.startsAt > new Date()) throw new SettlementError("NOT_STARTED", "This match hasn't kicked off yet", 409);
  // Guard on status so a result an admin entered a moment ago is never flipped back to LIVE.
  const r = await prisma.fixture.updateMany({ where: { id: fixtureId, status: { in: ["SCHEDULED", "LIVE"] } }, data: { homeScore, awayScore, status: "LIVE", lastSyncedAt: new Date() } });
  if (!r.count) throw new SettlementError("ALREADY_SETTLED", "This match is already settled");
}

/**
 * Match cancelled/abandoned: every selection on it is void (odds 1.00 on multiples, stake
 * back on singles), its markets close and the fixture is marked CANCELLED.
 */
export async function voidFixture(fixtureId: string): Promise<{ betsSettled: number }> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const fixture = await tx.fixture.findUniqueOrThrow({ where: { id: fixtureId }, include: { markets: { select: { id: true } } } });
    if (fixture.status === "FINISHED" || fixture.status === "CANCELLED")
      throw new SettlementError("ALREADY_SETTLED", `This match is already ${fixture.status === "FINISHED" ? "settled" : "void"}`);
    const marketIds = fixture.markets.map((m) => m.id);
    await tx.selection.updateMany({ where: { marketId: { in: marketIds } }, data: { status: "VOID" } });
    await tx.betSelection.updateMany({ where: { fixtureId, status: "OPEN" }, data: { status: "VOID" } });
    await tx.market.updateMany({ where: { id: { in: marketIds } }, data: { status: "SETTLED" } });
    await tx.fixture.update({ where: { id: fixtureId }, data: { status: "CANCELLED", lastSyncedAt: new Date() } });
  });
  const betsSettled = await settleAffectedBets(fixtureId);
  await runAutoCashouts(); // a void leg (odds 1.00) changes the offer on the bets still running
  return { betsSettled };
}

/** Settle every pending bet with a leg on this fixture (multiples wait for their other legs). */
async function settleAffectedBets(fixtureId: string): Promise<number> {
  const affected = await prisma.betSelection.findMany({
    where: { fixtureId, bet: { status: "PENDING" } },
    select: { betId: true },
    distinct: ["betId"],
  });
  let settled = 0;
  for (const { betId } of affected) if (await settleBet(betId)) settled++;
  return settled;
}

/** Settle one bet once its result is decided (any leg lost, or every leg graded). Idempotent + balanced. Returns true if it settled now. */
export async function settleBet(betId: string): Promise<boolean> {
  type Win = { userId: string; payout: bigint; ref: string };
  let won = null as Win | null; // set inside the transaction (TS can't see closure writes)
  try {
    const settled = await prisma.$transaction(async (tx) => {
      // Lock the bet: a cash out running at the same moment must not also pay it.
      await tx.$queryRaw`SELECT id FROM "Bet" WHERE id = ${betId} FOR UPDATE`;
      const bet = await tx.bet.findUniqueOrThrow({ where: { id: betId }, include: { selections: true } });
      if (bet.status !== "PENDING") return false; // settled, or cashed out in full
      // One lost leg decides a multiple: settle as lost at once, without waiting for the other games.
      const lost = bet.selections.some((s) => s.status === "LOST");
      if (!lost && bet.selections.some((s) => s.status === "OPEN")) return false; // can still win: wait
      const escrowId = await userAccountId(tx, bet.userId, "BET_ESCROW");
      const housePnl = await houseAccountId(tx, "HOUSE_PNL");

      if (lost) {
        await postTransaction(tx, "BET_LOSS", `bet_settle:${bet.id}`, [
          { accountId: escrowId, amount: -bet.stake }, // release escrow
          { accountId: housePnl, amount: bet.stake }, // house keeps the stake
        ], { betRef: bet.ref });
        await tx.bet.update({ where: { id: bet.id }, data: { status: "LOST", settledAt: new Date() } });
        return true;
      }

      // Won / void: void legs collapse to odds 1.0; payout recomputed from surviving legs.
      const legs = bet.selections.filter((s) => s.status === "WON").map((s) => s.milliOddsAtPlacement);
      const effective = legs.length ? legs : [1000];
      const combined = combineMilliOdds(effective);
      const payout = potentialPayout(bet.stake, combined);
      const allVoid = legs.length === 0;

      const cashId = await userAccountId(tx, bet.userId, "USER_CASH");
      await postTransaction(tx, allVoid ? "VOID_REFUND" : "BET_PAYOUT", `bet_settle:${bet.id}`, [
        { accountId: escrowId, amount: -bet.stake }, // release escrow
        { accountId: cashId, amount: payout }, // pay the customer
        { accountId: housePnl, amount: bet.stake - payout }, // house P/L (negative = house pays)
      ], { betRef: bet.ref, payout: payout.toString() });

      await tx.bet.update({
        where: { id: bet.id },
        data: { status: allVoid ? "VOID" : "WON", potentialPayout: payout, settledAt: new Date() },
      });
      if (!allVoid) won = { userId: bet.userId, payout, ref: bet.ref };
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    const w = won as Win | null;
    if (w) notifyWin(w.userId, w.payout, w.ref); // after commit: the money is really there
    return settled;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // already settled
    throw e;
  }
}
