import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { parseRange } from "@/lib/adminAnalytics";
import { commissionOverview, myCommission } from "@/lib/commission";
import { CopyButton } from "@/components/CopyButton";
import { siteUrl } from "@/lib/siteUrl";
import { DecideRequestButtons, DefaultRateForm, RecordPayoutButton, RequestPayoutButton, SetRateButton } from "@/components/admin/CommissionForms";
import { EmptyState, Figure, Head, Panel, Pill, Range, Strip, ago, ghs, td, tdNum, when } from "@/components/admin/kit";
import { formatPesewas } from "@/lib/money";

export const dynamic = "force-dynamic";

const pct = (bp: number) => `${bp / 100}%`;

/** Every admin's own commission; super admins also see everyone's and set rates and record payouts. */
export default async function CommissionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["commission.view"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const range = parseRange(await searchParams);
  const manage = can(u, "admins.manage");
  const [me, all] = await Promise.all([myCommission(u.id, range), manage ? commissionOverview() : null]);
  const rangeLabel = range.key === "all" ? "all time" : "selected range";
  const link = `${siteUrl()}/register?ref=${encodeURIComponent(me.code)}`;

  return (
    <>
      <Head title="Commission">
        <Range path="/admin/commission" current={range.key} />
      </Head>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Your referral code and link" icon="link">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.12em] text-white">{me.code}</span>
            <CopyButton text={me.code} label="Copy code" />
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl border border-line bg-ink-800 px-3 py-2">
            <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-fog">{link}</span>
            <CopyButton text={link} label="Copy link" />
          </div>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-4xl font-extrabold tabular-nums text-lime">{pct(me.bp)}</span>
            <span className="text-sm text-fog">commission · {me.isDefault ? "default rate" : "your own rate"}</span>
          </p>
          <p className="mt-3 text-xs text-fog">
            You earn this rate on the net deposits (successful deposits plus withdrawal verification fees, minus successful withdrawals) of players who
            signed up with your referral code or link. It always uses the current rate. Payouts are recorded by a super admin.
          </p>
        </Panel>

        <Panel title="Your balance" icon="coins" flush>
          <Strip cols="grid-cols-1 sm:grid-cols-3">
            <Figure label="Earned" value={<span className="text-lime">{ghs(me.lifetime.earned)}</span>} note={`lifetime, on ${ghs(me.lifetime.net)} net`} />
            <Figure label="Paid to you" value={ghs(me.lifetime.paid)} />
            <Figure label="Owed to you" value={ghs(me.lifetime.owed)} note={me.lifetime.owed === 0n ? "all paid" : undefined} />
          </Strip>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
            {me.pending ? (
              <p className="text-sm text-fog">
                <Pill tone="warn">pending</Pill> You asked for <b className="text-white">{ghs(me.pending.amount)}</b> {ago(me.pending.createdAt)}. A super admin will approve or reject it.
              </p>
            ) : me.lifetime.owed > 0n ? (
              <>
                <RequestPayoutButton owedGhs={Number(me.lifetime.owed) / 100} />
                <span className="text-xs text-fog">Ask a super admin to pay what you&apos;re owed.</span>
              </>
            ) : (
              <p className="text-sm text-fog">Nothing to request yet: you can ask for a payout once you are owed commission.</p>
            )}
          </div>
        </Panel>
      </div>

      <Strip cols="grid-cols-2 md:grid-cols-4">
        <Figure label="Code sign-ups" value={me.range.signups} note={`${me.lifetime.signups} lifetime`} title="Players who signed up with your referral code or link" />
        <Figure label="Depositors" value={me.range.depositors} title="Of those players, how many deposited" />
        <Figure label="Deposits" value={ghs(me.range.deposits)} />
        <Figure label="Verification fees" value={ghs(me.range.verification)} title="Withdrawal verification (KYC/NTT) payments by your players" />
        <Figure label="Withdrawals" value={ghs(me.range.withdrawals)} />
        <Figure label="Net deposits" value={ghs(me.range.net)} />
        <Figure label="Commission" value={ghs(me.range.commission)} note={`at ${pct(me.bp)} · ${rangeLabel}`} />
      </Strip>

      {me.requests.length > 0 && (
        <Panel title="Your payout requests" icon="clock" flush>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-fog">
                <tr>
                  <th className={td}>Requested</th>
                  <th className={td}>Pay to</th>
                  <th className={td}>Status</th>
                  <th className={tdNum}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {me.requests.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} whitespace-nowrap text-fog`}>{when(r.createdAt)}</td>
                    <td className={`${td} break-words text-white`}>{r.note}</td>
                    <td className={td}>
                      <Pill tone={r.status === "APPROVED" ? "good" : r.status === "REJECTED" ? "bad" : "warn"}>{r.status === "APPROVED" ? "paid" : r.status.toLowerCase()}</Pill>
                      {r.reason && <span className="mt-1 block break-words text-xs text-fog">{r.reason}</span>}
                    </td>
                    <td className={`${tdNum} font-semibold text-white`}>{ghs(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Payouts to you" icon="coins" flush>
        {me.payouts.length === 0 ? (
          <EmptyState icon="coins" title="No payouts yet">Payouts a super admin records for you appear here.</EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
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
          <Panel title="Payout requests" icon="clock" flush actions={all.queue.length > 0 ? <Pill tone="warn">{all.queue.length} waiting</Pill> : undefined}>
            {all.queue.length === 0 ? (
              <EmptyState icon="check" title="No payout requests waiting">When an admin asks to be paid their commission, the request appears here.</EmptyState>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-fog">
                    <tr>
                      <th className={td}>Admin</th>
                      <th className={td}>Pay to</th>
                      <th className={td}>Requested</th>
                      <th className={tdNum}>Amount</th>
                      <th className={tdNum}>Owed now</th>
                      <th className={td}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {all.queue.map((r) => {
                      const name = r.admin ? (r.admin.displayName ?? r.admin.email) : "Unknown admin";
                      const owedNow = all.rows.find((a) => a.id === r.adminId)?.owed ?? 0n;
                      return (
                        <tr key={r.id}>
                          <td className={td}>
                            <span className="block break-all font-semibold text-white">{name}</span>
                            {r.admin && <span className="block font-mono text-[11px] text-fog">{r.admin.referralCode}</span>}
                          </td>
                          <td className={`${td} break-words text-white`}>{r.note}</td>
                          <td className={`${td} whitespace-nowrap text-fog`}>{ago(r.createdAt)}</td>
                          <td className={`${tdNum} font-semibold text-white`}>{ghs(r.amount)}</td>
                          <td className={`${tdNum} ${owedNow < r.amount ? "text-danger" : "text-fog"}`} title={owedNow < r.amount ? "Now owed less than requested (their rate or figures changed): approving will be refused" : undefined}>
                            {ghs(owedNow)}
                          </td>
                          <td className={`${td} whitespace-nowrap`}>
                            <DecideRequestButtons requestId={r.id} name={name} amountGhs={formatPesewas(r.amount)} note={r.note} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
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
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[66rem] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-fog">
                  <tr>
                    <th className={td}>Admin</th>
                    <th className={td}>Rate</th>
                    <th className={tdNum}>Sign-ups</th>
                    <th className={tdNum}>Deposits</th>
                    <th className={tdNum}>Verification</th>
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
                          <span className="block font-mono text-[11px] text-fog">{a.referralCode}</span>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="font-semibold tabular-nums text-white">{pct(a.bp)}</span> <span className="text-xs text-fog">{a.isDefault ? "default" : "own"}</span>
                        </td>
                        <td className={tdNum}>{a.signups}</td>
                        <td className={tdNum}>{ghs(a.deposits)}</td>
                        <td className={tdNum}>{ghs(a.verification)}</td>
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
