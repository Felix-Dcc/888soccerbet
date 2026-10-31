import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { openExposure } from "@/lib/adminStats";
import { manualPayoutQueue, verificationQueue } from "@/lib/wallet";
import { formatPesewas } from "@/lib/money";
import { kickoffDay, kickoffTime } from "@/lib/time";
import { Crest } from "@/components/Crest";
import { SyncButton, SettleForm, VerificationReview } from "@/components/AdminTools";
import { readScript } from "@/lib/scriptedMatches";
import { PayoutActions } from "@/components/admin/PayoutActions";
import { BarList, EmptyState, Figure, Head, Panel, Pill, Strip, Tabs, ago, ghs, ghsShort } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

/** Trading desk: results to enter, withdrawals to pay by hand, verifications to review, open exposure, the odds sync. Each part needs its own permission. Creating games is on /admin/games. */
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ queue?: string }> }) {
  const gate = await adminPage(["settlement.manage", "verification.review", "odds.sync", "bets.view", "payments.payout"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const want = (await searchParams).queue;
  const queue = want === "manual" || want === "started" ? want : "all";
  const now = new Date();
  // Needs a result: every open manual game, plus feed matches that have kicked off.
  const settleWhere: Prisma.FixtureWhereInput = {
    status: { in: ["SCHEDULED", "LIVE"] },
    OR: queue === "manual" ? [{ providerRef: null }] : queue === "started" ? [{ startsAt: { lte: now } }] : [{ providerRef: null }, { startsAt: { lte: now } }],
  };
  const [toSettle, counts, verifications, exposure, lastSync, payouts] = await Promise.all([
    can(u, "settlement.manage")
      ? prisma.fixture.findMany({
          where: settleWhere,
          orderBy: { startsAt: "asc" },
          take: 60,
          include: { competition: true, _count: { select: { betSelections: { where: { status: "OPEN" } } } } },
        })
      : [],
    can(u, "settlement.manage")
      ? Promise.all([
          prisma.fixture.count({ where: { status: { in: ["SCHEDULED", "LIVE"] }, OR: [{ providerRef: null }, { startsAt: { lte: now } }] } }),
          prisma.fixture.count({ where: { status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { lte: now } } }),
          prisma.fixture.count({ where: { status: { in: ["SCHEDULED", "LIVE"] }, providerRef: null } }),
        ])
      : null,
    can(u, "verification.review") ? verificationQueue() : null,
    can(u, "bets.view") ? openExposure() : null,
    prisma.fixture.aggregate({ where: { providerRef: { not: null } }, _max: { lastSyncedAt: true } }),
    can(u, "payments.payout") ? manualPayoutQueue() : null,
  ]);
  const exposureTotal = exposure?.reduce((n, e) => n + e.openStake, 0n) ?? 0n;
  const ready = verifications?.filter((v) => v.complete).length ?? 0;

  return (
    <>
      <Head title="Trading desk">{can(u, "odds.sync") && <SyncButton />}</Head>

      <Strip cols="grid-cols-2 md:grid-cols-4">
        <Figure label="Awaiting result" value={counts ? counts[0] : "—"} note={counts ? `${counts[1]} kicked off · ${counts[2]} manual` : undefined} />
        <Figure label="Verifications ready" value={verifications ? ready : "—"} note={verifications ? `${verifications.length - ready} part-paid` : undefined} />
        <Figure label="Open exposure" value={exposure ? ghsShort(exposureTotal) : "—"} note={exposure ? `${exposure.length} matches` : undefined} title="Stake on open bets with a leg on each match" />
        <Figure label="Odds synced" value={ago(lastSync._max.lastSyncedAt)} />
      </Strip>

      {payouts && payouts.length > 0 && (
        <Panel title="Withdrawals to pay" icon="coins" flush actions={<span className="text-xs text-fog">{ghs(payouts.reduce((n, p) => n + p.amount, 0n))} total</span>}>
          <ul className="divide-y divide-line">
            {payouts.map((p) => {
              const m = (p.metadata ?? {}) as { msisdn?: string; network?: string; accountName?: string };
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {ghs(p.amount)} <span className="font-normal text-fog">to</span> <span className="font-mono">{m.msisdn ?? "—"}</span> <span className="text-fog">{m.network ?? ""}</span>
                    </span>
                    <span className="block truncate text-xs text-fog">
                      {m.accountName ? <span className="text-white">{m.accountName}</span> : null}
                      {m.accountName ? " · " : ""}
                      {p.user.displayName ?? p.user.email} · {p.ref} · asked {ago(p.createdAt)}
                    </span>
                  </span>
                  <PayoutActions refCode={p.ref} amount={formatPesewas(p.amount)} msisdn={m.msisdn ?? "?"} network={m.network ?? "?"} accountName={m.accountName} />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {can(u, "settlement.manage") && (
            <Panel title="Settlement queue" icon="ticket" flush>
              <Tabs
                current={queue}
                tabs={[
                  { key: "all", label: "All", href: "/admin/operations", count: counts?.[0] },
                  { key: "started", label: "Kicked off", href: "/admin/operations?queue=started", count: counts?.[1] },
                  { key: "manual", label: "Manual", href: "/admin/operations?queue=manual", count: counts?.[2] },
                ]}
              />
              {toSettle.length === 0 ? (
                <EmptyState icon="check" title="Nothing waiting for a result" />
              ) : (
                <ul className="divide-y divide-line">
                  {toSettle.map((f) => (
                    <li key={f.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex -space-x-1.5">
                          <Crest name={f.homeTeam} src={f.homeTeamLogo} size="sm" />
                          <Crest name={f.awayTeam} src={f.awayTeamLogo} size="sm" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {f.homeTeam} <span className="font-normal text-fog">v</span> {f.awayTeam}
                          </span>
                          <span className="block truncate text-xs text-fog">
                            {f.competition.displayName ?? f.competition.name} · {kickoffDay(f.startsAt.toISOString())} {kickoffTime(f.startsAt.toISOString())} · #{f.code}
                            {f.homeScore !== null && ` · live ${f.homeScore}–${f.awayScore}`}
                          </span>
                        </span>
                        {f.providerRef === null && <Pill tone="warn">manual</Pill>}
                        <span className="w-16 text-right text-xs tabular-nums text-fog">{f._count.betSelections} open</span>
                      </div>
                      <div className="mt-2 pl-[3.25rem]">
                        <SettleForm fixtureId={f.id} home={f.homeTeam} away={f.awayTeam} started={f.startsAt <= now} manual={f.providerRef === null} startsAt={f.startsAt.toISOString()} homeScore={f.homeScore} awayScore={f.awayScore} script={readScript(f.script)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {verifications && (
            <Panel title="Withdrawal verification" icon="lock" flush>
              {verifications.length === 0 ? (
                <EmptyState icon="check" title="No verifications waiting" />
              ) : (
                <ul className="divide-y divide-line">
                  {verifications.map((v) => (
                    <li key={v.userId} className="space-y-2 px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-semibold text-white">{v.email}</span>
                        {v.complete ? <Pill tone="warn">ready</Pill> : <Pill tone="neutral">1 of 2</Pill>}
                      </div>
                      <div className="text-xs text-fog">{ghs(v.held)} held</div>
                      <VerificationReview userId={v.userId} email={v.email} heldGhs={formatPesewas(v.held)} complete={v.complete} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {exposure && (
            <Panel title="Open exposure by match" icon="alert">
              <BarList
                rows={exposure.slice(0, 8).map((e) => ({
                  key: e.fixtureId,
                  label: `${e.homeTeam} v ${e.awayTeam}`,
                  value: Number(e.openStake),
                  display: `${ghsShort(e.openStake)} · ${e.openLegs} sel`,
                  href: `/fixture/${e.fixtureId}`,
                }))}
                color="rgb(var(--warn))"
                empty="No open bets"
              />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
