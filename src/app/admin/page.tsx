import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { adminComparison, competitionActivity, parseRange, previousRange, recentActivity, scopeMetrics, scopeSeries, topPlayers } from "@/lib/adminAnalytics";
import { systemHealth } from "@/lib/systemHealth";
import { verificationQueue } from "@/lib/wallet";
import { TrendChart } from "@/components/admin/TrendChart";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { ReferralDashboard } from "@/components/admin/ReferralDashboard";
import { GgrBreakdown, StatusRail } from "@/components/admin/blocks";
import { BarList, Delta, EmptyState, Figure, Grid, Head, Icon, Light, Panel, Range, Stack, Strip, ago, btnGhost, ghs, ghsShort, td, tdNum } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const num = (p: bigint) => Number(p) / 100;

/** Executive command center (needs reports.view); other admins get their partner desk. */
export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage();
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const sp = await searchParams;
  const range = parseRange(sp);

  if (!can(u, "reports.view")) {
    return (
      <>
        <Head title={`Welcome, ${u.displayName ?? u.email}`}>{can(u, "referrals.view") && <Range path="/admin" current={range.key} />}</Head>
        {can(u, "referrals.view") ? (
          <ReferralDashboard admin={u} range={range} playersLinkable path="/admin" q={sp.q} />
        ) : (
          <Panel>
            <EmptyState icon="lock" title="Your sections are in the menu">
              Ask a super admin if you need access to something else.
            </EmptyState>
          </Panel>
        )}
      </>
    );
  }

  const all = { kind: "all" as const };
  const prevR = previousRange(range);
  const [m, prev, series, comps, admins, top, activity, health, verifications, unsettled] = await Promise.all([
    scopeMetrics(all, range),
    prevR ? scopeMetrics(all, prevR) : Promise.resolve(null),
    scopeSeries(all, range),
    competitionActivity(all, range),
    can(u, "admins.view") ? adminComparison(range) : Promise.resolve(null),
    can(u, "users.view") ? topPlayers(all, range, 6) : Promise.resolve(null),
    recentActivity(all, can(u, "audit_logs.view"), 24),
    can(u, "system.view") ? systemHealth() : Promise.resolve(null),
    can(u, "verification.review") ? verificationQueue() : Promise.resolve(null),
    can(u, "settlement.manage") ? prisma.fixture.count({ where: { status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { lt: new Date(Date.now() - 2 * 3600_000) } } }) : Promise.resolve(null),
  ]);
  const net = m.money.deposits.total - m.money.withdrawals.total;
  const liab = m.money.liabilities;
  const attention = [
    verifications && verifications.filter((v) => v.complete).length > 0 && { key: "ver", level: "warn" as const, text: `${verifications.filter((v) => v.complete).length} withdrawal verification${verifications.filter((v) => v.complete).length === 1 ? "" : "s"} ready to review`, href: "/admin/operations" },
    unsettled && { key: "uns", level: "warn" as const, text: `${unsettled} match${unsettled === 1 ? "" : "es"} past kick-off without a result`, href: "/admin/operations" },
    m.money.pending.count > 0 && { key: "pend", level: "idle" as const, text: `${m.money.pending.count} payment${m.money.pending.count === 1 ? "" : "s"} pending (${ghs(m.money.pending.total)})`, href: "/admin/system" },
    m.money.failed.count > 0 && { key: "fail", level: "warn" as const, text: `${m.money.failed.count} failed payment${m.money.failed.count === 1 ? "" : "s"} in range`, href: "/admin/system" },
    ...(health?.alerts.filter((a) => a.level !== "ok").map((a) => ({ key: a.title, level: a.level === "critical" ? ("critical" as const) : ("warn" as const), text: `${a.title}: ${a.detail}`, href: a.href ?? "/admin/system" })) ?? []),
  ].filter((x): x is { key: string; level: "warn" | "idle" | "critical"; text: string; href: string } => !!x);

  return (
    <>
      <Head title="Command center" description="Users, money and betting across Bet Zone at a glance.">
        <Range path="/admin" current={range.key} />
        {can(u, "reports.export") && (
          <details className="relative">
            <summary className={`${btnGhost} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <Icon name="download" />
              Export
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-ink-700 p-1.5 shadow-lift">
              {(["players", "bets", "payments", ...(can(u, "admins.view") ? ["admins"] : [])] as const).map((k) => (
                <a key={k} href={`/api/admin/export?kind=${k}&range=${range.key}`} className="block rounded-lg px-3 py-2 text-sm capitalize text-white hover:bg-ink-500">
                  {k === "players" ? "users" : k} (CSV)
                </a>
              ))}
            </div>
          </details>
        )}
      </Head>

      {health && <StatusRail alerts={health.alerts} lastSync={ago(health.lastSync)} />}

      <Strip>
        <Figure label="New users" value={m.players.newInRange} delta={<Delta cur={m.players.newInRange} prev={prev?.players.newInRange ?? null} />} note={`${m.players.total} total`} />
        <Figure label="Active bettors" value={m.players.activeBettors} delta={<Delta cur={m.players.activeBettors} prev={prev?.players.activeBettors ?? null} />} />
        <Figure label="Depositors" value={m.players.depositors} delta={<Delta cur={m.players.depositors} prev={prev?.players.depositors ?? null} />} />
        <Figure label="Bets placed" value={m.betting.placed.count} delta={<Delta cur={m.betting.placed.count} prev={prev?.betting.placed.count ?? null} />} />
        <Figure label="Stakes placed" value={ghsShort(m.betting.placed.stakes)} delta={<Delta cur={m.betting.placed.stakes} prev={prev?.betting.placed.stakes ?? null} />} title="Total staked. Not revenue." />
        <Figure label="Open bets" value={m.betting.open.count} note={ghsShort(m.betting.open.stakes)} />
      </Strip>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Panel title="House result" icon="coins">
          <GgrBreakdown m={m} prev={prev} spark={series.map((p) => num(p.ggr))} />
        </Panel>
        <Panel title="Cash position" icon="coins">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-fog">Deposits</dt>
              <dd className="mt-1 font-display text-2xl font-bold tracking-tight tabular-nums text-white">{ghs(m.money.deposits.total)}</dd>
              <dd className="mt-2 flex items-center gap-2 text-xs text-fog">
                <Delta cur={m.money.deposits.total} prev={prev?.money.deposits.total ?? null} /> {m.money.deposits.count} payments
              </dd>
            </div>
            <div>
              <dt className="text-fog">Withdrawals</dt>
              <dd className="mt-1 font-display text-2xl font-bold tracking-tight tabular-nums text-white">{ghs(m.money.withdrawals.total)}</dd>
              <dd className="mt-2 flex items-center gap-2 text-xs text-fog">
                <Delta cur={m.money.withdrawals.total} prev={prev?.money.withdrawals.total ?? null} invert /> {m.money.withdrawals.count} payments
              </dd>
            </div>
            <div className="col-span-2 flex items-baseline justify-between border-t border-line pt-4">
              <dt className="text-fog">Net cash flow</dt>
              <dd className={`font-display text-lg font-bold tabular-nums ${net < 0n ? "text-danger" : "text-white"}`}>{ghs(net)}</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-fog">Owed to users now</span>
              <span className="font-display font-bold tabular-nums text-white">{ghs(liab.total)}</span>
            </div>
            <Stack
              parts={[
                { label: "Balances", value: num(liab.cash), color: "rgb(var(--lime))", display: ghsShort(liab.cash) },
                { label: "Open stakes", value: num(liab.escrow), color: "rgb(var(--warn))", display: ghsShort(liab.escrow) },
                { label: "Verification held", value: num(liab.held), color: "rgb(var(--fog))", display: ghsShort(liab.held) },
              ]}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel title="Trend" icon="system">
          <TrendChart points={series.map((p) => ({ bucket: p.bucket, registrations: p.registrations, deposits: num(p.deposits), withdrawals: num(p.withdrawals), stakes: num(p.stakes), ggr: num(p.ggr) }))} />
        </Panel>
        <Panel title="Needs attention" icon="alert" flush>
          {attention.length === 0 ? (
            <EmptyState icon="check" title="Nothing waiting" />
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-start gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-ink-600">
                    <span className="mt-1.5">
                      <Light level={a.level} />
                    </span>
                    <span className="min-w-0 flex-1 text-white">{a.text}</span>
                    <Icon name="chevron" className="mt-0.5 h-4 w-4 shrink-0 text-fog" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Settled bets" icon="ticket">
          <Stack
            parts={[
              { label: "Won", value: m.betting.won.count, color: "rgb(var(--teal))" },
              { label: "Lost", value: m.betting.lost.count, color: "rgb(var(--danger))" },
              { label: "Void", value: m.betting.void.count, color: "rgb(var(--fog))" },
              { label: "Cash outs", value: m.betting.cashouts.count, color: "rgb(var(--warn))" },
            ]}
          />
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-fog">Winnings paid</dt>
              <dd className="tabular-nums text-white">{ghs(m.betting.won.paid)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fog">Losing stakes</dt>
              <dd className="tabular-nums text-white">{ghs(m.betting.lost.stakes)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fog">Cash outs paid</dt>
              <dd className="tabular-nums text-white">{ghs(m.betting.cashouts.paid)}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Where users bet" icon="ticket">
          <BarList rows={comps.map((c) => ({ key: c.id, label: c.name, value: c.legs, display: `${c.legs} sel · ${c.bets} bets` }))} empty="No bets in this range" />
        </Panel>
        {admins ? (
          <Panel title="Team leaderboard" icon="team" actions={<Link href="/admin/admins" className="text-xs font-semibold text-lime hover:underline">Team →</Link>}>
            <BarList
              rows={[...admins]
                .sort((a, b) => b.metrics.players.total - a.metrics.players.total)
                .slice(0, 6)
                .map((a) => ({ key: a.id, label: a.displayName ?? a.email, value: a.metrics.players.total, display: `${a.metrics.players.total} users · ${ghsShort(a.metrics.revenue.ggr)} revenue`, href: `/admin/admins/${a.id}` }))}
              color="rgb(var(--lime))"
              empty="No administrators"
            />
          </Panel>
        ) : (
          <Panel title="Payments" icon="coins">
            <Stack
              parts={[
                { label: "Pending", value: m.money.pending.count, color: "rgb(var(--warn))" },
                { label: "Failed", value: m.money.failed.count, color: "rgb(var(--danger))" },
              ]}
            />
          </Panel>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Live activity" icon="clock" flush>
          <ActivityFeed items={activity.map((a) => ({ at: a.at.toISOString(), kind: a.kind, text: a.text, href: a.href && can(u, a.kind === "admin" ? "audit_logs.view" : "users.view") ? a.href : undefined }))} />
        </Panel>
        {top && (
          <Panel title="Top users by stake" icon="players" flush>
            {top.length === 0 ? (
              <EmptyState icon="players" title="No bets in this range" />
            ) : (
              <Grid head={["User", "Bets", "Staked"]} right={[1, 2]} minWidth="22rem">
                {top.map((p, i) => (
                  <tr key={p.id}>
                    <td className={td}>
                      <span className="mr-2 tabular-nums text-fog">{i + 1}</span>
                      <Link href={`/admin/users/${p.id}`} className="font-medium text-white hover:text-lime">
                        {p.email}
                      </Link>
                    </td>
                    <td className={`${tdNum} text-fog`}>{p.bets}</td>
                    <td className={`${tdNum} text-white`}>{ghs(p.stakes)}</td>
                  </tr>
                ))}
              </Grid>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
