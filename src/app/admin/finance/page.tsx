import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { parseRange, scopeMetrics } from "@/lib/adminAnalytics";
import { manualPayoutQueue } from "@/lib/wallet";
import { formatPesewas } from "@/lib/money";
import { Head, KpiCard, Panel, Grid, Tabs, Pill, EmptyState, Range, Icon, ghs, td, when, payTone } from "@/components/admin/kit";
import { PayoutActions } from "@/components/admin/PayoutActions";

export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["payments.view", "payments.payout"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const sp = await searchParams;
  const range = parseRange(sp);
  const tab = sp.tab === "ledger" ? "ledger" : "pending";

  const all = { kind: "all" as const };
  const [m, payouts, recentTxns] = await Promise.all([
    scopeMetrics(all, range),
    can(u, "payments.payout") ? manualPayoutQueue() : Promise.resolve([]),
    prisma.paymentIntent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, email: true, displayName: true, phone: true } } },
    }),
  ]);

  const totalBetVolume = m.betting.placed.stakes;
  const totalWinnings = m.betting.won.paid + m.betting.cashouts.paid;

  return (
    <>
      <Head title="Finance & Wallet" description="Manage deposits, withdrawals, and monitor the platform ledger.">
        <Range path="/admin/finance" current={range.key} />
      </Head>

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Icon name="plus" className="h-5 w-5" />}
          iconBg="bg-green-500/20 text-green-400"
          value={ghs(m.money.deposits.total)}
          label="TOTAL DEPOSITS"
        />
        <KpiCard
          icon={<Icon name="desk" className="h-5 w-5" />}
          iconBg="bg-red-500/20 text-red-400"
          value={ghs(m.money.withdrawals.total)}
          label="TOTAL WITHDRAWALS"
        />
        <KpiCard
          icon={<Icon name="chart" className="h-5 w-5" />}
          iconBg="bg-blue-500/20 text-blue-400"
          value={ghs(totalBetVolume)}
          label="TOTAL BET VOLUME"
        />
        <KpiCard
          icon={<Icon name="check" className="h-5 w-5" />}
          iconBg="bg-purple-500/20 text-purple-400"
          value={ghs(totalWinnings)}
          label="TOTAL WINNINGS PAID"
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs
        current={tab}
        tabs={[
          { key: "pending", label: "Pending Approvals Queue", href: "/admin/finance?tab=pending", count: payouts.length },
          { key: "ledger", label: "Recent Ledger Transactions", href: "/admin/finance?tab=ledger", count: recentTxns.length },
        ]}
      />

      {/* ── Tab content ── */}
      {tab === "pending" ? (
        <Panel flush>
          {payouts.length === 0 ? (
            <EmptyState icon="check" title="No pending withdrawals" />
          ) : (
            <Grid head={["User", "Type", "Amount", "Requested", "Actions"]} right={[2, 4]} minWidth="40rem">
              {payouts.map((p) => (
                <tr key={p.ref}>
                  <td className={td}>
                    <Link href={`/admin/users/${p.user.id}`} className="text-white hover:text-lime">
                      {p.user.email}
                      {p.user.displayName && <span className="block text-xs text-fog">{p.user.displayName}</span>}
                      {p.user.phone && <span className="block text-xs text-fog">{p.provider}: {p.user.phone}</span>}
                    </Link>
                  </td>
                  <td className={td}><Pill tone="bad">WITHDRAWAL</Pill></td>
                  <td className={`${td} text-right tabular-nums font-semibold text-white`}>GHS {formatPesewas(p.amount)}</td>
                  <td className={`${td} whitespace-nowrap text-fog`}>{when(p.createdAt)}</td>
                  <td className={td}>{can(u, "payments.payout") && <PayoutActions payRef={p.ref} />}</td>
                </tr>
              ))}
            </Grid>
          )}
        </Panel>
      ) : (
        <Panel flush>
          {recentTxns.length === 0 ? (
            <EmptyState icon="desk" title="No transactions yet" />
          ) : (
            <Grid head={["User", "Type", "Status", "Amount", "Date"]} right={[3]} minWidth="40rem">
              {recentTxns.map((t) => (
                <tr key={t.ref}>
                  <td className={td}>
                    <Link href={`/admin/users/${t.user.id}`} className="text-white hover:text-lime">{t.user.email}</Link>
                  </td>
                  <td className={td}><Pill tone={t.direction === "DEPOSIT" ? "good" : "bad"}>{t.direction}</Pill></td>
                  <td className={td}><Pill tone={payTone(t.status)}>{t.status.toLowerCase()}</Pill></td>
                  <td className={`${td} text-right tabular-nums font-semibold text-white`}>GHS {formatPesewas(t.amount)}</td>
                  <td className={`${td} whitespace-nowrap text-fog`}>{when(t.createdAt)}</td>
                </tr>
              ))}
            </Grid>
          )}
        </Panel>
      )}
    </>
  );
}
