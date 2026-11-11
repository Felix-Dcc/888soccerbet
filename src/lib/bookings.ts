/**
 * Booking codes: share a betslip as a short code. Only selection ids are stored; loading a
 * code re-reads every selection so the slip always gets current odds and status. Placing
 * the bet still goes through the bet engine, which re-validates everything again.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { bookingCode, normaliseCode } from "./ids";
import { isBettable, liveScore } from "./markets";

export class BookingError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

export interface BookedPick {
  selectionId: string;
  fixtureId: string;
  milliOdds: number;
  selectionName: string;
  marketName: string;
  fixtureName: string;
  score?: { home: number; away: number } | null; // set while the match is in play
  suspended?: boolean; // in play and paused (a goal is being repriced): kept on the slip, can't be placed yet
}

function loadSelections(ids: string[]) {
  return prisma.selection.findMany({
    where: { id: { in: ids } },
    include: { market: { include: { fixture: true } } },
  });
}
type LoadedSelection = Awaited<ReturnType<typeof loadSelections>>[number];

const open = (s: LoadedSelection) => s.status === "OPEN" && s.market.status === "OPEN" && isBettable(s.market.fixture);

// A generated football match in play between prices (just after a goal): the leg comes back once it reprices.
// A pick the score has ruled out stays closed while the match is priced, so it is dropped as before.
const paused = (s: LoadedSelection) => {
  const f = s.market.fixture;
  return f.status === "LIVE" && f.script !== null && f.sportKey === "football" && !isBettable(f);
};

const toPick = (s: LoadedSelection): BookedPick => {
  const f = s.market.fixture;
  return {
    selectionId: s.id,
    fixtureId: s.market.fixtureId,
    milliOdds: s.milliOdds,
    selectionName: s.name,
    marketName: s.market.name,
    fixtureName: `${f.homeTeam} v ${f.awayTeam}`,
    score: liveScore(f),
    suspended: !open(s),
  };
};

/** Book a slip. Every leg must be open now and on a different match, same rules as placement. */
export async function createBooking(selectionIds: string[], userId?: string): Promise<string> {
  const ids = [...new Set(selectionIds)];
  const rows = await loadSelections(ids);
  if (rows.length !== ids.length) throw new BookingError("SELECTION_NOT_FOUND", "A selection no longer exists");
  if (rows.some((s) => !open(s))) throw new BookingError("MARKET_CLOSED", "A selection on your slip is no longer available");
  if (new Set(rows.map((s) => s.market.fixtureId)).size !== rows.length)
    throw new BookingError("CORRELATED_LEGS", "A slip cannot have two selections on the same match");

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = bookingCode();
    try {
      await prisma.bookingCode.create({ data: { code, selectionIds: ids, createdById: userId } });
      return code;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
    }
  }
  throw new Error("could not allocate a booking code");
}

/**
 * Current state of a list of selections, in the given order: open ones at today's odds,
 * plus a count of those that no longer exist or have closed. Used by booking codes and to
 * revalidate a betslip the browser kept from an earlier visit.
 */
export async function resolvePicks(ids: string[]): Promise<{ picks: BookedPick[]; unavailable: number }> {
  const rows = await loadSelections(ids);
  const byId = new Map(rows.map((s) => [s.id, s]));
  const picks = ids.map((id) => byId.get(id)).filter((s): s is LoadedSelection => !!s && (open(s) || paused(s))).map(toPick);
  return { picks, unavailable: ids.length - picks.length };
}

/** Load a code. Legs that have since closed are reported, not silently dropped. */
export async function loadBooking(rawCode: string): Promise<{ code: string; picks: BookedPick[]; unavailable: number }> {
  const code = normaliseCode(rawCode);
  const booking = await prisma.bookingCode.findUnique({ where: { code } });
  if (!booking) throw new BookingError("BOOKING_NOT_FOUND", `Booking code not found: ${code}`, 404);
  return { code, ...(await resolvePicks(booking.selectionIds)) };
}
