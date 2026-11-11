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
import { StatusRail } from "@/components/admin/blocks";
import { Head, Icon, KpiCard, Light, Panel, QuickLink, Range, Stack, EmptyState, ago, btnGhost, ghs, ghsShort } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const num = (p: bigint) => Number(p) / 100;

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

  const totalBets = m.betting.open.count + m.betting.won.count + m.betting.lost.count + m.betting.void.count + m.betting.cashouts.count;
  const pct = (n: number) => (totalBets > 0 ? Math.round((n / totalBets) * 100) : 0);

  const attention = [
    verifications && verifications.filter((v) => v.complete).length > 0 && { key: "ver", level: "warn" as const, text: `${verifications.filter((v) => v.complete).length} withdrawal verification${verifications.filter((v) => v.complete).length === 1 ? "" : "s"} ready to review`, href: "/admin/operations" },
    unsettled && { key: "uns", level: "warn" as const, text: `${unsettled} match${unsettled === 1 ? "" : "es"} past kick-off without a result`, href: "/admin/operations" },
    m.money.pending.count > 0 && { key: "pend", level: "idle" as const, text: `${m.money.pending.count} payment${m.money.pending.count === 1 ? "" : "s"} pending (${ghs(m.money.pending.total)})`, href: "/admin/system" },
    m.money.failed.count > 0 && { key: "fail", level: "warn" as const, text: `${m.money.failed.count} failed payment${m.money.failed.count === 1 ? "" : "s"} in range`, href: "/admin/system" },
    ...(health?.alerts.filter((a) => a.level !== "ok").map((a) => ({ key: a.title, level: a.level === "critical" ? ("critical" as const) : ("warn" as const), text: `${a.title}: ${a.detail}`, href: a.href ?? "/admin/system" })) ?? []),
  ].filter((x): x is { key: string; level: "warn" | "idle" | "critical"; text: string; href: string } => !!x);

  return (
    <>
      {/* ── Title area ── */}
      <Head title="Super Admin Command Center" description="Live overview of users, active bets, deposits, and platform performance metrics.">
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

      {/* ── 4 KPI cards (Bet Prime style) ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Icon name="players" className="h-5 w-5" />}
          iconBg="bg-[#7C3AED]/10 text-[#8B5CF6]"
          badge="Active"
          value={m.players.total.toLocaleString()}
          label="Total registered users"
        />
        <KpiCard
          icon={<Icon name="desk" className="h-5 w-5" />}
          iconBg="bg-[#EA580C]/10 text-[#EA580C]"
          badge="Live"
          value={m.betting.open.count.toLocaleString()}
          label="Active open bets"
        />
        <KpiCard
          icon={<Icon name="ticket" className="h-5 w-5" />}
          iconBg="bg-[#2563EB]/10 text-[#3B82F6]"
          badge={range.key === "today" ? "Today" : range.key}
          value={m.betting.placed.count.toLocaleString()}
          label="Bets placed"
        />
        <KpiCard
          icon={<Icon name="coins" className="h-5 w-5" />}
          iconBg="bg-lime/10 text-lime"
          badge="Real-time"
          value={ghs(m.money.deposits.total)}
          label="Total deposits (revenue)"
        />
      </div>

      {/* ── Chart + Bet Distribution ── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Deposit & Revenue Growth" icon="coins">
          <TrendChart points={series.map((p) => ({ bucket: p.bucket, registrations: p.registrations, deposits: num(p.deposits), withdrawals: num(p.withdrawals), stakes: num(p.stakes), ggr: num(p.ggr) }))} />
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-fog">Account volume: <b className="text-white">{ghs(m.money.deposits.total)}</b></span>
            <Link href="/admin/system" className="font-semibold text-lime hover:underline">View Ledger →</Link>
          </div>
        </Panel>

        <Panel title="Bet Distribution" icon="ticket">
          <p className="mb-5 text-sm text-fog">Open vs Settled Bets</p>
          <div className="space-y-5">
            <DistRow label="Open / Pending Bets" count={m.betting.open.count} pct={pct(m.betting.open.count)} color="bg-[#F59E0B]" />
            <DistRow label="Won Bets" count={m.betting.won.count} pct={pct(m.betting.won.count)} color="bg-lime" />
            <DistRow label="Lost Bets" count={m.betting.lost.count} pct={pct(m.betting.lost.count)} color="bg-danger" />
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <Link href="/admin/operations" className="flex items-center justify-center gap-2 rounded-xl border border-line bg-ink-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-600">
              Manage All Bets <Icon name="chevron" className="h-4 w-4" />
            </Link>
          </div>
        </Panel>
      </div>

      {/* ── Needs attention ── */}
      {attention.length > 0 && (
        <Panel title="Needs attention" icon="alert" flush>
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-start gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-ink-600">
                  <span className="mt-1.5"><Light level={a.level} /></span>
                  <span className="min-w-0 flex-1 text-white">{a.text}</span>
                  <Icon name="chevron" className="mt-0.5 h-4 w-4 shrink-0 text-fog" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Quick-link cards (Bet Prime style) ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <QuickLink href="/admin/users" icon="players" iconBg="bg-[#7C3AED]/10 text-[#8B5CF6]" title="User Management" desc={`View ${m.players.total.toLocaleString()} registered players`} />
        <QuickLink href="/admin/games" icon="plus" iconBg="bg-[#2563EB]/10 text-[#3B82F6]" title="Match Management" desc="Score & settlement controls" />
        <QuickLink href="/admin/system" icon="coins" iconBg="bg-lime/10 text-lime" title="Finance & Withdrawals" desc={`Payouts & ${ghs(m.money.deposits.total)} deposits`} />
      </div>

      {/* ── Activity + Top users ── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Live activity" icon="clock" flush>
          <ActivityFeed items={activity.map((a) => ({ at: a.at.toISOString(), kind: a.kind, text: a.text, href: a.href && can(u, a.kind === "admin" ? "audit_logs.view" : "users.view") ? a.href : undefined }))} />
        </Panel>
        {top && top.length > 0 && (
          <Panel title="Top users by stake" icon="players" flush>
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-fog">
                  <th className="px-5 py-2 font-semibold">User</th>
                  <th className="px-5 py-2 text-right font-semibold">Bets</th>
                  <th className="px-5 py-2 text-right font-semibold">Staked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {top.map((p, i) => (
                  <tr key={p.id} className="transition-colors hover:bg-ink-600">
                    <td className="px-5 py-3">
                      <span className="mr-2 tabular-nums text-fog">{i + 1}</span>
                      <Link href={`/admin/users/${p.id}`} className="font-medium text-white hover:text-lime">{p.email}</Link>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-fog">{p.bets}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-white">{ghs(p.stakes)}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

function DistRow({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-fog">{label}</span>
        <span className="font-bold tabular-nums text-white">{count.toLocaleString()} <span className="font-normal text-fog">({pct}%)</span></span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink-600">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}
