/** Open exposure for the trading desk. All money in pesewas. */
import { prisma } from "./db";

export interface ExposureRow {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  openLegs: number;
  openStake: bigint; // stake of open bets with a leg on this match
}

/** Every match with open legs on pending bets, biggest stake first. */
export async function openExposure(): Promise<ExposureRow[]> {
  // shortcut: aggregates in JS over open legs; move to SQL GROUP BY once volumes are large.
  const open = await prisma.betSelection.findMany({
    where: { bet: { status: "PENDING" }, status: "OPEN" },
    select: { fixture: { select: { id: true, homeTeam: true, awayTeam: true } }, bet: { select: { stake: true } } },
  });
  const exp = new Map<string, ExposureRow>();
  for (const l of open) {
    const f = l.fixture;
    const row = exp.get(f.id) ?? { fixtureId: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam, openLegs: 0, openStake: 0n };
    row.openLegs++;
    row.openStake += l.bet.stake;
    exp.set(f.id, row);
  }
  return [...exp.values()].sort((a, b) => (b.openStake > a.openStake ? 1 : b.openStake < a.openStake ? -1 : 0));
}
