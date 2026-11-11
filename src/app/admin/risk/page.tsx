import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { formatPesewas } from "@/lib/money";
import { Head, KpiCard, Panel, Grid, EmptyState, Icon, td, ghs } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const HIGH_STAKE_THRESHOLD = 5000_00n; // 5000 GHS in pesewas

export default async function RiskPage() {
  const gate = await adminPage(["bets.view"]);
  if (!gate.ok) return gate.deny;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400_000);

  const [flaggedBets, highStakes24h, suspiciousPatterns] = await Promise.all([
    // Bets where a user bet on multiple sides of the same fixture (correlated / arb attempt)
    prisma.$queryRaw<{ userId: string; email: string; fixtureId: string; fixture: string; betCount: number; totalStake: bigint }[]>`
      SELECT b."userId" AS "userId", u.email, f.id AS "fixtureId",
        f."homeTeam" || ' vs ' || f."awayTeam" AS fixture,
        COUNT(DISTINCT b.id)::int AS "betCount",
        COALESCE(SUM(b.stake),0)::bigint AS "totalStake"
      FROM "BetSelection" bs
      JOIN "Bet" b ON b.id = bs."betId"
      JOIN "Fixture" f ON f.id = bs."fixtureId"
      JOIN "User" u ON u.id = b."userId"
      WHERE b.status = 'PENDING'
      GROUP BY b."userId", u.email, f.id, f."homeTeam", f."awayTeam"
      HAVING COUNT(DISTINCT b.id) > 1
      ORDER BY "totalStake" DESC
      LIMIT 20`,
    // High-stake bets in last 24h
    prisma.bet.count({
      where: { stake: { gte: HIGH_STAKE_THRESHOLD }, placedAt: { gte: yesterday } },
    }),
    // Unusual pattern: users with many bets in short time
    prisma.$queryRaw<{ userId: string; email: string; betCount: number; totalStake: bigint; maxPayout: bigint }[]>`
      SELECT b."userId", u.email, COUNT(*)::int AS "betCount",
        COALESCE(SUM(b.stake),0)::bigint AS "totalStake",
        COALESCE(MAX(b."potentialPayout"),0)::bigint AS "maxPayout"
      FROM "Bet" b
      JOIN "User" u ON u.id = b."userId"
      WHERE b."placedAt" >= ${yesterday}
      GROUP BY b."userId", u.email
      HAVING COUNT(*) >= 10 OR MAX(b.stake) >= ${HIGH_STAKE_THRESHOLD}
      ORDER BY "totalStake" DESC
      LIMIT 20`,
  ]);

  return (
    <>
      <Head title="Risk Management" description="Monitor suspicious activities, manage global limits, and track high-risk betting patterns." />

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          icon={<Icon name="lock" className="h-5 w-5" />}
          iconBg="bg-red-500/20 text-red-400"
          badge="Requires manual review"
          value={flaggedBets.length}
          label="FLAGGED BETS"
        />
        <KpiCard
          icon={<Icon name="chart" className="h-5 w-5" />}
          iconBg="bg-yellow-500/20 text-yellow-400"
          badge={`Bets over GHS ${Number(HIGH_STAKE_THRESHOLD) / 100}`}
          value={highStakes24h}
          label="HIGH STAKES (24H)"
        />
        <KpiCard
          icon={<Icon name="players" className="h-5 w-5" />}
          iconBg="bg-purple-500/20 text-purple-400"
          badge="Rapid betting or high volume"
          value={suspiciousPatterns.length}
          label="UNUSUAL PATTERNS (24H)"
        />
      </div>

      {/* ── Flagged Bets ── */}
      <Panel title="Multi-Bet Flags (same fixture)" icon="lock" flush>
        {flaggedBets.length === 0 ? (
          <EmptyState icon="check" title="No flagged bets">No users have placed multiple bets on the same fixture.</EmptyState>
        ) : (
          <Grid head={["User", "Fixture", "Bets", "Total Stake"]} right={[2, 3]} minWidth="30rem">
            {flaggedBets.map((r, i) => (
              <tr key={i}>
                <td className={td}>
                  <Link href={`/admin/users/${r.userId}`} className="text-white hover:text-lime">{r.email}</Link>
                </td>
                <td className={`${td} text-fog`}>{r.fixture}</td>
                <td className={`${td} text-right tabular-nums text-white`}>{r.betCount}</td>
                <td className={`${td} text-right tabular-nums text-lime`}>GHS {formatPesewas(r.totalStake)}</td>
              </tr>
            ))}
          </Grid>
        )}
      </Panel>

      {/* ── Unusual Betting Patterns ── */}
      <Panel title="Unusual Betting Patterns (24h)" icon="chart" flush>
        {suspiciousPatterns.length === 0 ? (
          <EmptyState icon="check" title="No suspicious patterns detected" />
        ) : (
          <Grid head={["User", "Bets (24h)", "Total Stake", "Highest Payout", "Reason"]} right={[1, 2, 3]} minWidth="40rem">
            {suspiciousPatterns.map((r, i) => (
              <tr key={i}>
                <td className={td}>
                  <Link href={`/admin/users/${r.userId}`} className="text-white hover:text-lime">{r.email}</Link>
                </td>
                <td className={`${td} text-right tabular-nums text-white`}>{r.betCount}</td>
                <td className={`${td} text-right tabular-nums text-white`}>GHS {formatPesewas(r.totalStake)}</td>
                <td className={`${td} text-right tabular-nums text-lime`}>GHS {formatPesewas(r.maxPayout)}</td>
                <td className={`${td} text-fog`}>
                  {r.betCount >= 10 && r.maxPayout >= HIGH_STAKE_THRESHOLD ? "High volume + high stake" : r.betCount >= 10 ? "High volume" : "High stake"}
                </td>
              </tr>
            ))}
          </Grid>
        )}
      </Panel>
    </>
  );
}
