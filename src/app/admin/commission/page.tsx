import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { parseRange } from "@/lib/adminAnalytics";
import { formatReferralCode } from "@/lib/admins";
import { commissionOverview, myCommission } from "@/lib/commission";
import { CopyButton } from "@/components/CopyButton";
import { DefaultRateForm, RecordPayoutButton, SetRateButton } from "@/components/admin/CommissionForms";
import { EmptyState, Figure, Head, Panel, Pill, Range, Strip, ghs, td, tdNum, when } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const pct = (bp: number) => `${bp / 100}%`;

/** Every admin's own commission; super admins also see everyone's and set rates and record payouts. */
export default async function CommissionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage();
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const range = parseRange(await searchParams);
  const manage = can(u, "admins.manage");
  const [me, all] = await Promise.all([myCommission(u.id, range), manage ? commissionOverview() : null]);
  const rangeLabel = range.key === "all" ? "all time" : "selected range";

  return (
    <>
      <Head title="Commission">
        <Range path="/admin/commission" current={range.key} />
      </Head>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Your code" icon="link">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.12em] text-white">{formatReferralCode(me.code, true)}</span>
            <CopyButton text={formatReferralCode(me.code, true)} label="Copy code" />
          </div>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-4xl font-extrabold tabular-nums text-lime">{pct(me.bp)}</span>
            <span className="text-sm text-fog">commission · {me.isDefault ? "default rate" : "your own rate"}</span>
          </p>
          <p className="mt-3 text-xs text-fog">
            You earn this rate on the net deposits (successful deposits minus successful withdrawals) of players who signed up with your referral code or
            link. It always uses the current rate. Payouts are recorded by a super admin.
          </p>
        </Panel>

        <Panel title="Your balance" icon="coins" flush>
          <Strip cols="grid-cols-3">
            <Figure label="Earned" value={<span className="text-lime">{ghs(me.lifetime.earned)}</span>} note={`lifetime, on ${ghs(me.lifetime.net)} net`} />
            <Figure label="Paid to you" value={ghs(me.lifetime.paid)} />
            <Figure label="Owed to you" value={ghs(me.lifetime.owed)} note={me.lifetime.owed === 0n ? "all paid" : undefined} />
          </Strip>
        </Panel>
      </div>

      <Strip>
        <Figure label="Code sign-ups" value={me.range.signups} note={`${me.lifetime.signups} lifetime`} title="Players who signed up with your referral code or link" />
        <Figure label="Depositors" value={me.range.depositors} title="Of those players, how many deposited" />
        <Figure label="Deposits" value={ghs(me.range.deposits)} />
        <Figure label="Withdrawals" value={ghs(me.range.withdrawals)} />
        <Figure label="Net deposits" value={ghs(me.range.net)} />
        <Figure label="Commission" value={ghs(me.range.commission)} note={`at ${pct(me.bp)} · ${rangeLabel}`} />
      </Strip>

      <Panel title="Payouts to you" icon="coins" flush>
        {me.payouts.length === 0 ? (
          <EmptyState icon="coins" title="No payouts yet">Payouts a super admin records for you appear here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-fog">
                <tr>
                  <th className={td}>Date</th>
                  <th className={td}>Note</th>
                  <th className={`${tdNum}`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {me.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className={`${td} whitespace-nowrap text-fog`}>{when(p.createdAt)}</td>
                    <td className={`${td} text-white`}>{p.note ?? "—"}</td>
                    <td className={`${tdNum} font-semibold text-white`}>{ghs(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {all && (
        <>
          <h2 className="pt-2 font-display text-lg font-bold text-white">All admins</h2>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Panel title="Default rate" icon="chart">
              <DefaultRateForm bp={all.defaultBp} />
            </Panel>
            <Panel title="Totals · lifetime" icon="coins" flush>
              <Strip cols="grid-cols-2 md:grid-cols-4">
                <Figure label="Net deposits" value={ghs(all.totals.net)} />
                <Figure label="Commission earned" value={ghs(all.totals.earned)} />
                <Figure label="Paid out" value={ghs(all.totals.paid)} />
                <Figure label="Still owed" value={ghs(all.totals.owed)} />
              </Strip>
            </Panel>
          </div>

          <Panel title="Admins · lifetime" icon="team" flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-fog">
                  <tr>
                    <th className={td}>Admin</th>
                    <th className={td}>Rate</th>
                    <th className={tdNum}>Sign-ups</th>
                    <th className={tdNum}>Deposits</th>
                    <th className={tdNum}>Withdrawals</th>
                    <th className={tdNum}>Net deposits</th>
                    <th className={tdNum}>Earned</th>
                    <th className={tdNum}>Paid</th>
                    <th className={tdNum}>Owed</th>
                    <th className={td}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {all.rows.map((a) => {
                    const name = a.displayName ?? a.email;
                    const removed = a.status === "CLOSED";
                    return (
                      <tr key={a.id}>
                        <td className={td}>
                          <span className="block max-w-[14rem] truncate font-semibold text-white">{name}</span>
                          <span className="block font-mono text-[11px] text-fog">{formatReferralCode(a.referralCode, true)}</span>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="font-semibold tabular-nums text-white">{pct(a.bp)}</span> <span className="text-xs text-fog">{a.isDefault ? "default" : "own"}</span>
                        </td>
                        <td className={tdNum}>{a.signups}</td>
                        <td className={tdNum}>{ghs(a.deposits)}</td>
                        <td className={tdNum}>{ghs(a.withdrawals)}</td>
                        <td className={tdNum}>{ghs(a.net)}</td>
                        <td className={`${tdNum} text-lime`}>{ghs(a.earned)}</td>
                        <td className={`${tdNum} text-fog`}>{ghs(a.paid)}</td>
                        <td className={`${tdNum} font-semibold text-white`}>{ghs(a.owed)}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <div className="flex items-center justify-end gap-2">
                            {removed ? <Pill tone="neutral">removed</Pill> : <SetRateButton adminId={a.id} name={name} bp={a.bp} isDefault={a.isDefault} defaultBp={all.defaultBp} />}
                            <RecordPayoutButton adminId={a.id} name={name} owedGhs={Number(a.owed) / 100} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
