import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can, isStaff } from "@/lib/permissions";
import { canViewPlayer } from "@/lib/playerAdmin";
import { accountBalance } from "@/lib/ledger";
import { formatMilliOdds } from "@/lib/money";
import { parseRange, scopeMetrics } from "@/lib/adminAnalytics";
import { PlayerActions, PromoteToAdmin } from "@/components/admin/AdminForms";
import { Avatar, EmptyState, Figure, Grid, Light, Panel, Pill, Strip, Tabs, betTone, ghs, payTone, statusTone, td, tdNum, when, type Level } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

/** Read-only balance: a missing account is 0 (viewing never creates ledger rows). */
async function balanceOf(userId: string, kind: "USER_CASH" | "BET_ESCROW" | "VERIFICATION_HOLD" | "NTT_HOLD") {
  const acct = await prisma.ledgerAccount.findUnique({ where: { userId_kind_currency: { userId, kind, currency: "GHS" } }, select: { id: true } });
  return acct ? accountBalance(prisma, acct.id) : 0n;
}

/** One player as an investigation file, showing only what this admin's permissions allow. */
export default async function PlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const gate = await adminPage(["users.view", "referrals.view", "referrals.view_all"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const { id } = await params;
  const p = await prisma.user.findFirst({ where: { id, role: "USER" }, include: { referredBy: { select: { id: true, email: true, displayName: true, role: true } } } });
  if (!p || !canViewPlayer(u, { referredById: p.referredById, referredByStaff: !!p.referredBy && isStaff(p.referredBy) })) notFound();

  const tabs = [
    can(u, "bets.view") && { key: "bets", label: "Bets" },
    can(u, "payments.view") && { key: "payments", label: "Payments" },
    can(u, "audit_logs.view") && { key: "staff", label: "Staff actions" },
  ].filter((t): t is { key: string; label: string } => !!t);
  const wanted = (await searchParams).tab;
  const tab = tabs.find((t) => t.key === wanted)?.key ?? tabs[0]?.key;
  const full = can(u, "users.view");

  const [cash, escrow, held, life, bets, payments, history] = await Promise.all([
    balanceOf(p.id, "USER_CASH"),
    balanceOf(p.id, "BET_ESCROW"),
    Promise.all([balanceOf(p.id, "VERIFICATION_HOLD"), balanceOf(p.id, "NTT_HOLD")]).then(([kyc, ntt]) => kyc + ntt),
    scopeMetrics({ kind: "player", userId: p.id }, parseRange({ range: "all" })),
    tab === "bets" ? prisma.bet.findMany({ where: { userId: p.id }, orderBy: { placedAt: "desc" }, take: 30 }) : Promise.resolve(null),
    tab === "payments"
      ? prisma.paymentIntent.findMany({ where: { userId: p.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, ref: true, direction: true, status: true, amount: true, createdAt: true, metadata: true } })
      : Promise.resolve(null),
    tab === "staff" ? prisma.auditLog.findMany({ where: { targetType: "User", targetId: p.id }, orderBy: { seq: "desc" }, take: 30, include: { actor: { select: { email: true } } } }) : Promise.resolve(null),
  ]);

  const settled = life.betting.won.count + life.betting.lost.count;
  const houseResult = life.revenue.ggr; // positive: the house is up on this player
  const now = new Date();
  const signals: { level: Level; text: string }[] = [
    p.status !== "ACTIVE" && { level: "critical" as Level, text: `Account ${p.status.toLowerCase()}` },
    p.selfExcludedUntil && p.selfExcludedUntil > now && { level: "warn" as Level, text: `Self-excluded until ${when(p.selfExcludedUntil)}` },
    houseResult < 0n && { level: "warn" as Level, text: `User is up ${ghs(-houseResult)} against the house` },
    life.money.failed.count > 0 && { level: "warn" as Level, text: `${life.money.failed.count} failed payment${life.money.failed.count === 1 ? "" : "s"}` },
    life.money.withdrawals.total > life.money.deposits.total && { level: "idle" as Level, text: "Withdrawn more than deposited" },
    p.kycStatus === "PENDING" && { level: "idle" as Level, text: "KYC verification awaiting review" },
    p.kycStatus === "NTT_PENDING" && { level: "idle" as Level, text: "NTT compliance awaiting review" },
    p.kycStatus === "KYC_APPROVED" && { level: "idle" as Level, text: "KYC approved — NTT compliance stage next" },
    (p.dailyDepositLimit !== null || p.maxStakeLimit !== null) && { level: "idle" as Level, text: "Responsible-gambling limits set" },
  ].filter((x): x is { level: Level; text: string } => !!x);

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <Avatar name={p.email} size="h-12 w-12 text-sm" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[22px] font-bold text-white">{p.email}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fog">
            <Pill tone={statusTone(p.status)}>{p.status.toLowerCase()}</Pill>
            <Pill tone={p.kycStatus === "VERIFIED" ? "good" : p.kycStatus === "REJECTED" || p.kycStatus === "NTT_REJECTED" ? "bad" : p.kycStatus === "KYC_APPROVED" ? "warn" : "neutral"}>{p.kycStatus.replace("_", " ").toLowerCase()}</Pill>
            <span>Joined {when(p.createdAt)}</span>
            <span className="font-mono">{p.id}</span>
          </div>
        </div>
      </header>

      <Strip>
        <Figure label="Balance" value={ghs(cash)} />
        <Figure label="Open stakes" value={ghs(escrow)} />
        <Figure label="Deposited" value={ghs(life.money.deposits.total)} note={`${life.money.deposits.count} payments`} />
        <Figure label="Withdrawn" value={ghs(life.money.withdrawals.total)} note={`${life.money.withdrawals.count} payments`} />
        <Figure label="Bets" value={life.betting.placed.count} note={settled ? `${Math.round((life.betting.won.count / settled) * 100)}% won` : "none settled"} />
        <Figure label="House result" value={ghs(houseResult)} tone={houseResult < 0n ? "bad" : undefined} title="Gross revenue from this user's bets: what the house kept after paying their winnings (ledger)" />
      </Strip>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {tabs.length > 0 ? (
            <Panel flush>
              <Tabs current={tab!} tabs={tabs.map((t) => ({ ...t, href: `/admin/users/${p.id}?tab=${t.key}` }))} />
              {bets &&
                (bets.length === 0 ? (
                  <EmptyState icon="ticket" title="No bets" />
                ) : (
                  <Grid head={["Ticket", "Placed", "Type", "Status", "Stake", "Odds", "Return"]} right={[4, 5, 6]} minWidth="44rem">
                    {bets.map((b) => (
                      <tr key={b.id}>
                        <td className={`${td} font-mono text-xs text-white`}>{b.ref}</td>
                        <td className={`${td} whitespace-nowrap text-fog`}>{when(b.placedAt)}</td>
                        <td className={`${td} text-fog`}>{b.type === "ACCUMULATOR" ? "Multiple" : "Single"}</td>
                        <td className={td}>
                          <Pill tone={betTone(b.status)}>{b.status.toLowerCase()}</Pill>
                        </td>
                        <td className={`${tdNum} text-white`}>{ghs(b.stake)}</td>
                        <td className={`${tdNum} text-fog`}>{formatMilliOdds(b.combinedMilliOdds)}</td>
                        <td className={`${tdNum} text-white`}>{b.status === "LOST" ? "—" : ghs(b.potentialPayout)}</td>
                      </tr>
                    ))}
                  </Grid>
                ))}
              {payments &&
                (payments.length === 0 ? (
                  <EmptyState icon="coins" title="No payments" />
                ) : (
                  <Grid head={["Reference", "When", "Type", "Status", "Amount"]} right={[4]} minWidth="36rem">
                    {payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className={`${td} font-mono text-xs text-white`}>{pay.ref}</td>
                        <td className={`${td} whitespace-nowrap text-fog`}>{when(pay.createdAt)}</td>
                        <td className={`${td} text-fog`}>
                          {(pay.metadata as { purpose?: string } | null)?.purpose === "VERIFICATION" ? "Verification" : pay.direction === "DEPOSIT" ? "Deposit" : "Withdrawal"}
                        </td>
                        <td className={td}>
                          <Pill tone={payTone(pay.status)}>{pay.status.toLowerCase()}</Pill>
                        </td>
                        <td className={`${tdNum} text-white`}>{ghs(pay.amount)}</td>
                      </tr>
                    ))}
                  </Grid>
                ))}
              {history &&
                (history.length === 0 ? (
                  <EmptyState icon="audit" title="No staff actions on this user" />
                ) : (
                  <Grid head={["When", "By", "Action", "Change"]} minWidth="40rem">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className={`${td} whitespace-nowrap text-fog`}>{when(h.createdAt)}</td>
                        <td className={`${td} text-white`}>{h.actor?.email ?? "system"}</td>
                        <td className={`${td} font-mono text-xs text-white`}>{h.action}</td>
                        <td className={`${td} max-w-80 truncate font-mono text-[11px] text-fog`}>
                          {h.before ? `${JSON.stringify(h.before)} → ` : ""}
                          {JSON.stringify(h.after ?? h.metadata ?? {})}
                        </td>
                      </tr>
                    ))}
                  </Grid>
                ))}
            </Panel>
          ) : (
            <Panel>
              <EmptyState icon="lock" title="Bet and payment history need more access" />
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel title="Signals" icon="alert" flush>
            {signals.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-3 text-sm text-fog">
                <Light level="ok" /> Nothing unusual on record
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {signals.map((s) => (
                  <li key={s.text} className="flex items-start gap-3 px-4 py-2.5 text-sm text-white">
                    <span className="mt-1.5">
                      <Light level={s.level} />
                    </span>
                    {s.text}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Account" icon="players">
            <dl className="grid grid-cols-[7.5rem_1fr] gap-y-2 text-sm">
              {full && (
                <>
                  <dt className="text-fog">Phone</dt>
                  <dd className="tabular-nums text-white">{p.phone ?? "—"}</dd>
                  <dt className="text-fog">Date of birth</dt>
                  <dd className="text-white">{p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : "—"}</dd>
                  <dt className="text-fog">Limits</dt>
                  <dd className="text-white">
                    {[p.dailyDepositLimit !== null && `${ghs(p.dailyDepositLimit)}/day deposits`, p.maxStakeLimit !== null && `${ghs(p.maxStakeLimit)} max stake`].filter(Boolean).join(" · ") || "None"}
                  </dd>
                </>
              )}
              <dt className="text-fog">Held</dt>
              <dd className="tabular-nums text-white">{ghs(held)}</dd>
              <dt className="text-fog">Referred by</dt>
              <dd className="min-w-0 text-white">
                {p.referredBy ? (
                  <>
                    {can(u, "admins.view") && isStaff(p.referredBy) ? (
                      <Link href={`/admin/admins/${p.referredBy.id}`} className="hover:text-lime">
                        {p.referredBy.displayName ?? p.referredBy.email}
                      </Link>
                    ) : (
                      (p.referredBy.displayName ?? p.referredBy.email)
                    )}
                    <div className="text-xs text-fog">
                      {p.referralSource === "LINK" ? "via link" : p.referralSource === "AUTO" ? "auto-assigned" : "via code"}
                      {p.referredAt && ` · ${when(p.referredAt)}`}
                    </div>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
          </Panel>

          {(can(u, "users.suspend") || can(u, "wallets.adjust") || can(u, "verification.review")) && (
            <Panel title="Actions" icon="lock">
              <PlayerActions
                playerId={p.id}
                email={p.email}
                status={p.status}
                canSuspend={can(u, "users.suspend")}
                canAdjust={can(u, "wallets.adjust")}
                canVerify={can(u, "verification.review")}
                verified={p.kycStatus === "VERIFIED"}
              />
            </Panel>
          )}

          {can(u, "admins.manage") && p.status === "ACTIVE" && (
            <Panel title="Make administrator" icon="team">
              <PromoteToAdmin userId={p.id} email={p.email} roles={await prisma.adminRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, permissions: true } })} />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
