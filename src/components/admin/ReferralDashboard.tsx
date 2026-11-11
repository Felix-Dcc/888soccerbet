import Link from "next/link";
import { siteUrl } from "@/lib/siteUrl";
import { prisma } from "@/lib/db";
import { previousRange, referralFunnel, scopeMetrics, scopeSeries, type Range } from "@/lib/adminAnalytics";
import { CopyButton } from "@/components/CopyButton";
import { TrendChart } from "./TrendChart";
import { GgrBreakdown } from "./blocks";
import { Delta, EmptyState, Figure, Funnel, Grid, Icon, Panel, Pill, Strip, field, ghs, statusTone, td, tdNum, when } from "./kit";

const num = (p: bigint) => Number(p) / 100;


/**
 * Partner desk: one administrator's referral network. Deposits and stakes are player activity,
 * not company revenue; GGR is the house's result on those players' bets.
 */
export async function ReferralDashboard({
  admin,
  range,
  playersLinkable,
  path,
  q = "",
}: {
  admin: { id: string; referralCode: string };
  range: Range;
  playersLinkable: boolean;
  path: string;
  q?: string;
}) {
  const scope = { kind: "referrer" as const, adminId: admin.id };
  const prevR = previousRange(range);
  const search = q.trim().slice(0, 80);
  const [m, prev, funnel, series, players, rate] = await Promise.all([
    scopeMetrics(scope, range),
    prevR ? scopeMetrics(scope, prevR) : Promise.resolve(null),
    referralFunnel(admin.id),
    scopeSeries(scope, range),
    prisma.user.findMany({
      where: { role: "USER", referredById: admin.id, ...(search ? { email: { contains: search, mode: "insensitive" as const } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, email: true, status: true, kycStatus: true, createdAt: true, referralSource: true },
    }),
    Promise.all([
      prisma.user.findUnique({ where: { id: admin.id }, select: { commissionBp: true } }),
      prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { defaultCommissionBp: true } }),
    ]).then(([a, s]) => a?.commissionBp ?? s?.defaultCommissionBp ?? 0),
  ]);
  const ids = players.map((p) => p.id);
  const [deps, stakes] = ids.length
    ? await Promise.all([
        // COALESCE: a JSON filter on a missing "purpose" key would silently drop normal deposits.
        prisma.$queryRaw<{ userId: string; amount: bigint }[]>`
          SELECT p."userId", COALESCE(SUM(p.amount),0)::bigint AS amount FROM "PaymentIntent" p
          WHERE p."userId" = ANY(${ids}) AND p.direction = 'DEPOSIT' AND p.status = 'SUCCEEDED' AND COALESCE(p.metadata->>'purpose','') NOT IN ('VERIFICATION','NTT')
          GROUP BY p."userId"`,
        prisma.bet.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _sum: { stake: true }, _count: true }),
      ])
    : [[], []];
  const depOf = new Map(deps.map((d) => [d.userId, d.amount]));
  const stakeOf = new Map(stakes.map((s) => [s.userId, { stake: s._sum.stake ?? 0n, n: s._count }]));
  const code = admin.referralCode;
  const url = `${siteUrl()}/register?ref=${encodeURIComponent(code)}`;

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel title="Referral link" icon="link">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.12em] text-white">{code}</span>
            <CopyButton text={code} label="Copy code" />
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl border border-line bg-ink-800 px-3 py-2">
            <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-fog">{url}</span>
            <CopyButton text={url} label="Copy link" />
          </div>
          <Strip cols="grid-cols-4">
            <Figure label="Today" value={funnel.today} />
            <Figure label="7 days" value={funnel.week} />
            <Figure label="30 days" value={funnel.month} />
            <Figure label="Lifetime" value={funnel.lifetime} />
          </Strip>
        </Panel>
        <Panel title="Conversion · lifetime" icon="referral">
          <Funnel
            steps={[
              { label: "Signed up", value: funnel.lifetime },
              { label: "Deposited", value: funnel.depositors },
              { label: "Deposited 2+", value: funnel.repeat },
              { label: "Bet in 30 days", value: funnel.bettors30 },
            ]}
          />
          <p className="mt-3 text-xs text-fog">
            Commission: {rate / 100}% of net deposits from code sign-ups (
            <Link href="/admin/commission" className="font-semibold text-lime hover:underline">
              Commission
            </Link>
            ). Bonuses: none issued.
          </p>
        </Panel>
      </div>

      <Strip>
        <Figure label="New sign-ups" value={m.players.newInRange} delta={<Delta cur={m.players.newInRange} prev={prev?.players.newInRange ?? null} />} />
        <Figure label="Active bettors" value={m.players.activeBettors} delta={<Delta cur={m.players.activeBettors} prev={prev?.players.activeBettors ?? null} />} />
        <Figure label="Deposits" value={ghs(m.money.deposits.total)} delta={<Delta cur={m.money.deposits.total} prev={prev?.money.deposits.total ?? null} />} title="User money in. Not revenue." />
        <Figure label="Withdrawals" value={ghs(m.money.withdrawals.total)} delta={<Delta cur={m.money.withdrawals.total} prev={prev?.money.withdrawals.total ?? null} invert />} />
        <Figure label="Stakes placed" value={ghs(m.betting.placed.stakes)} note={`${m.betting.placed.count} bets`} title="Total staked. Not revenue." />
        <Figure label="Verified" value={`${m.players.verified} / ${m.players.total}`} note={`${m.players.suspended} suspended`} />
      </Strip>

      <div className="grid gap-5 2xl:grid-cols-2">
        <Panel title="House result from these users" icon="coins">
          <GgrBreakdown m={m} prev={prev} spark={series.map((p) => num(p.ggr))} />
        </Panel>
        <Panel title="Trend" icon="system">
          <TrendChart points={series.map((p) => ({ bucket: p.bucket, registrations: p.registrations, deposits: num(p.deposits), withdrawals: num(p.withdrawals), stakes: num(p.stakes), ggr: num(p.ggr) }))} />
        </Panel>
      </div>

      <Panel
        title="Referred users"
        icon="players"
        flush
        actions={
          <form role="search" action={path} className="flex items-center gap-2">
            <input type="hidden" name="range" value={range.key} />
            <label htmlFor="rp-q" className="sr-only">
              Search referred players
            </label>
            <input id="rp-q" name="q" defaultValue={search} placeholder="Search email" className={`${field} w-44 sm:w-56`} />
            <button className="grid h-9 w-9 place-items-center rounded-xl border border-line text-fog hover:text-white" aria-label="Search">
              <Icon name="search" />
            </button>
          </form>
        }
      >
        {players.length === 0 ? (
          <EmptyState icon="referral" title={search ? "No referred user matches" : "No sign-ups yet"}>
            {!search && "Share the referral link above; users who register with it appear here."}
          </EmptyState>
        ) : (
          <Grid head={["User", "Joined", "Source", "Status", "Verification", "Deposits", "Bets", "Staked"]} right={[5, 6, 7]} minWidth="52rem">
            {players.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-medium text-white`}>
                  {playersLinkable ? (
                    <Link href={`/admin/users/${p.id}`} className="hover:text-lime">
                      {p.email}
                    </Link>
                  ) : (
                    p.email
                  )}
                </td>
                <td className={`${td} text-fog`}>{when(p.createdAt)}</td>
                <td className={`${td} text-fog`}>{p.referralSource === "LINK" ? "Link" : p.referralSource === "AUTO" ? "Auto" : "Code"}</td>
                <td className={td}>
                  <Pill tone={statusTone(p.status)}>{p.status.toLowerCase()}</Pill>
                </td>
                <td className={`${td} text-fog`}>{p.kycStatus.toLowerCase()}</td>
                <td className={`${tdNum} text-white`}>{ghs(depOf.get(p.id) ?? 0n)}</td>
                <td className={`${tdNum} text-fog`}>{stakeOf.get(p.id)?.n ?? 0}</td>
                <td className={`${tdNum} text-white`}>{ghs(stakeOf.get(p.id)?.stake ?? 0n)}</td>
              </tr>
            ))}
          </Grid>
        )}
      </Panel>
    </>
  );
}
