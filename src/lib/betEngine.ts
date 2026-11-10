/**
 * Server-authoritative bet placement. Every financial decision happens here, inside a
 * single database transaction:
 *   - the user's cash account row is locked (SELECT ... FOR UPDATE) so concurrent bets
 *     for the same user serialise and cannot overspend,
 *   - odds are re-read from the DB and compared to what the customer accepted,
 *   - suspended markets/selections and finished fixtures are rejected (the selection and market
 *     rows are share-locked first, so a suspension racing the bet either lands before it and
 *     refuses it, or waits for it),
 *   - a bet on a match in play is held LIVE_BET_HOLD_MS first and refused if the score or price
 *     moved meanwhile (narrows the window between a goal and the feed reporting it),
 *   - the stake is moved USER_CASH -> BET_ESCROW via a balanced ledger transaction,
 *   - Bet.idempotencyKey makes a double submit return the original bet, not a second one.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { postTransaction, userAccountId, userCashBalance } from "./ledger";
import { combineMilliOdds, potentialPayout, toPesewas } from "./money";
import { multipleBonus } from "./bonus";
import { betRef, verifyCode } from "./ids";
import { isBettable } from "./markets";
import type { PlaceBetInput } from "./validation";

export class BetError extends Error {
  constructor(public code: string, message: string, public data?: unknown) {
    super(message);
  }
}

export async function limits() {
  const { getPlatformSettings } = await import("./platformSettings");
  const s = await getPlatformSettings();
  return {
    min: toPesewas(s.minStakeGhs),
    max: toPesewas(s.maxStakeGhs),
    maxPayout: toPesewas(s.maxPayoutGhs),
  };
}

/** Minimum stake in GHS, for the betslip UI (same setting the engine enforces). */
export async function minStakeGhs() {
  const { min } = await limits();
  return Number(min) / 100;
}

export interface PlacedBet {
  ref: string;
  stake: bigint;
  combinedMilliOdds: number;
  potentialPayout: bigint;
  status: string;
}

export async function placeBet(userId: string, input: PlaceBetInput): Promise<PlacedBet> {
  const { min, max, maxPayout } = await limits();
  const stake = toPesewas(input.stakeGhs);
  if (stake < min) throw new BetError("STAKE_TOO_LOW", `Minimum stake is ${min / 100n} GHS`);
  if (stake > max) throw new BetError("STAKE_TOO_HIGH", `Maximum stake is ${max / 100n} GHS`);

  // Idempotency fast path: same key => return the original bet.
  const prior = await prisma.bet.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (prior) return view(prior);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status !== "ACTIVE") throw new BetError("ACCOUNT_INACTIVE", "Your account cannot place bets");
  if (user.selfExcludedUntil && user.selfExcludedUntil > new Date())
    throw new BetError("SELF_EXCLUDED", "Self-exclusion is active on your account");
  if (user.maxStakeLimit && stake > user.maxStakeLimit)
    throw new BetError("USER_STAKE_LIMIT", "Stake exceeds your self-set limit");

  const fixtureIds = new Set<string>();

  // In-play legs: note the score and price, wait, and require both unchanged inside the transaction.
  const inPlay = await prisma.selection.findMany({
    where: { id: { in: input.selections.map((s) => s.selectionId) }, market: { fixture: { status: "LIVE" } } },
    select: { id: true, milliOdds: true, market: { select: { fixture: { select: { homeScore: true, awayScore: true } } } } },
  });
  if (inPlay.length) await new Promise((r) => setTimeout(r, Number(process.env.LIVE_BET_HOLD_MS ?? 5000)));
  const now = new Date();

  try {
    const placed = await prisma.$transaction(
      async (tx) => {
        // 1) Serialise this user's spending by locking the cash account row.
        const cashId = await userAccountId(tx, userId, "USER_CASH");
        await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${cashId} FOR UPDATE`;

        // 2) Re-read and validate every selection against live DB state.
        const legs: number[] = [];
        const betSelections: Prisma.BetSelectionCreateWithoutBetInput[] = [];
        for (const sel of input.selections) {
          // Read committed alone would let this read a market a goal is suspending right now as still OPEN.
          await tx.$queryRaw`SELECT s.id FROM "Selection" s JOIN "Market" m ON m.id = s."marketId" WHERE s.id = ${sel.selectionId} FOR SHARE`;
          const s = await tx.selection.findUnique({
            where: { id: sel.selectionId },
            include: { market: { include: { fixture: true } } },
          });
          if (!s) throw new BetError("SELECTION_NOT_FOUND", "A selection no longer exists");
          const { market } = s;
          const { fixture } = market;
          if (s.status === "SUSPENDED" || market.status === "SUSPENDED")
            throw new BetError("MARKET_SUSPENDED", `${fixture.homeTeam} v ${fixture.awayTeam}: market suspended`, { selectionId: s.id });
          if (s.status !== "OPEN" || market.status !== "OPEN")
            throw new BetError("MARKET_CLOSED", "A market on your slip is closed");
          if (!isBettable(fixture, now))
            throw new BetError("MATCH_STARTED", `${fixture.homeTeam} v ${fixture.awayTeam} ${fixture.status === "LIVE" && (process.env.LIVE_BETTING === "true" || fixture.script !== null) ? "is in play; betting is paused until prices update" : "has started; betting is closed"}`, {
              selectionId: s.id,
            });
          const before = inPlay.find((h) => h.id === s.id);
          if (before && (before.milliOdds !== s.milliOdds || before.market.fixture.homeScore !== fixture.homeScore || before.market.fixture.awayScore !== fixture.awayScore))
            throw new BetError("LIVE_CHANGED", `${fixture.homeTeam} v ${fixture.awayTeam}: the score or price changed while your bet was being confirmed. Check the slip and try again.`, {
              selectionId: s.id,
            });
          if (fixtureIds.has(fixture.id))
            throw new BetError("CORRELATED_LEGS", "An accumulator cannot combine two bets on the same match");
          fixtureIds.add(fixture.id);

          if (s.milliOdds !== sel.expectedMilliOdds && !input.acceptOddsChange)
            throw new BetError("ODDS_CHANGED", "Odds changed before your bet was placed", {
              selectionId: s.id,
              was: sel.expectedMilliOdds,
              now: s.milliOdds,
            });

          legs.push(s.milliOdds);
          betSelections.push({
            selection: { connect: { id: s.id } },
            fixture: { connect: { id: fixture.id } },
            milliOddsAtPlacement: s.milliOdds,
            status: "OPEN",
            marketName: market.name,
            selectionName: s.name,
            fixtureName: `${fixture.homeTeam} v ${fixture.awayTeam}`,
          });
        }

        const combined = combineMilliOdds(legs);
        const payout = potentialPayout(stake, combined);
        // The cap covers what the house could actually pay out, so the bonus counts towards it.
        if (payout + multipleBonus(payout, legs) > maxPayout)
          throw new BetError("PAYOUT_LIMIT", `Potential payout exceeds the ${maxPayout / 100n} GHS limit`);

        // 3) Funds check under the lock.
        const balance = await userCashBalance(tx, userId);
        if (balance < stake)
          throw new BetError("INSUFFICIENT_FUNDS", "Not enough balance for this stake", {
            balance: balance.toString(),
            stake: stake.toString(),
          });

        // 4) Create the bet, then move the stake into escrow (balanced ledger entries).
        const bet = await tx.bet.create({
          data: {
            ref: betRef(),
            verifyCode: verifyCode(),
            userId,
            type: input.selections.length === 1 ? "SINGLE" : "ACCUMULATOR",
            stake,
            combinedMilliOdds: combined,
            potentialPayout: payout,
            status: "PENDING",
            idempotencyKey: input.idempotencyKey,
            selections: { create: betSelections },
          },
        });
        const escrowId = await userAccountId(tx, userId, "BET_ESCROW");
        await postTransaction(
          tx,
          "BET_STAKE",
          `bet_stake:${bet.id}`,
          [
            { accountId: cashId, amount: -stake },
            { accountId: escrowId, amount: stake },
          ],
          { betRef: bet.ref },
        );
        return bet;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 },
    );
    return view(placed);
  } catch (e) {
    // Lost idempotency race: the other request created the bet — return it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.bet.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return view(existing);
    }
    throw e;
  }
}

function view(b: { ref: string; stake: bigint; combinedMilliOdds: number; potentialPayout: bigint; status: string }): PlacedBet {
  return {
    ref: b.ref,
    stake: b.stake,
    combinedMilliOdds: b.combinedMilliOdds,
    potentialPayout: b.potentialPayout,
    status: b.status,
  };
}
