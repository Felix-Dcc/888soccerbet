/**
 * Live operational checks for the admin console. Thresholds come from .env so alerts can be tuned
 * without code: STALE_ODDS_HOURS (default 50, just over the 48h sync), UNSETTLED_AFTER_HOURS
 * (default 4), PENDING_PAYMENT_ALERT_MINUTES (default 60).
 */
import { prisma } from "./db";
import { oddsProvider } from "./providers/odds";
import { paymentProvider } from "./providers/payments";
import { ledgerIsBalanced } from "./ledger";
import { verifyAuditChain } from "./audit";

export interface Alert {
  level: "ok" | "warn" | "critical";
  title: string;
  detail: string;
  href?: string;
}

const env = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};

export async function systemHealth() {
  const now = Date.now();
  const staleH = env("STALE_ODDS_HOURS", 50);
  const unsettledH = env("UNSETTLED_AFTER_HOURS", 4);
  const pendingMin = env("PENDING_PAYMENT_ALERT_MINUTES", 60);
  const odds = oddsProvider();
  const pay = paymentProvider();

  const [lastSync, staleMarkets, unsettled, failedPay, stuckPay, failedHooks, jobs, balanced, chain] = await Promise.all([
    prisma.fixture.aggregate({ where: { providerRef: { not: null } }, _max: { lastSyncedAt: true } }),
    prisma.market.count({
      where: { status: "OPEN", fixture: { providerRef: { not: null }, status: "SCHEDULED", startsAt: { gt: new Date(now) }, lastSyncedAt: { lt: new Date(now - staleH * 3600_000) } } },
    }),
    prisma.fixture.count({ where: { status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { lt: new Date(now - unsettledH * 3600_000) } } }),
    prisma.paymentIntent.count({ where: { status: "FAILED", createdAt: { gte: new Date(now - 86_400_000) } } }),
    prisma.paymentIntent.count({ where: { status: "PENDING", createdAt: { lt: new Date(now - pendingMin * 60_000) } } }),
    prisma.webhookEvent.count({ where: { status: "FAILED" } }),
    prisma.job.groupBy({ by: ["status"], _count: true }),
    ledgerIsBalanced(),
    verifyAuditChain(),
  ]);

  const syncedAt = lastSync._max.lastSyncedAt;
  const syncAgeH = syncedAt ? (now - syncedAt.getTime()) / 3600_000 : null;
  const failedJobs = jobs.find((j) => j.status === "FAILED")?._count ?? 0;
  const alerts: Alert[] = [
    balanced
      ? { level: "ok", title: "Ledger balanced", detail: "Every transaction's entries sum to zero" }
      : { level: "critical", title: "Ledger out of balance", detail: "Entries don't sum to zero: stop payouts and investigate" },
    chain.ok
      ? { level: "ok", title: "Audit log intact", detail: `${chain.checked} chained entries verified`, href: "/admin/audit" }
      : { level: "critical", title: "Audit log tampered", detail: `Chain breaks at entry #${chain.brokenAtSeq}`, href: "/admin/audit" },
    syncAgeH === null
      ? { level: "warn", title: "Odds never synced", detail: "Run the sync from the trading desk" , href: "/admin/operations" }
      : syncAgeH > staleH
        ? { level: "warn", title: "Odds are stale", detail: `Last sync ${Math.floor(syncAgeH)}h ago; ${staleMarkets} open markets on old prices`, href: "/admin/operations" }
        : { level: "ok", title: "Odds fresh", detail: `Last sync ${syncAgeH < 1 ? "under an hour" : `${Math.floor(syncAgeH)}h`} ago` },
    unsettled
      ? { level: "warn", title: "Matches waiting for results", detail: `${unsettled} started over ${unsettledH}h ago and aren't settled; is the worker running?`, href: "/admin/operations" }
      : { level: "ok", title: "Settlement up to date", detail: `Nothing older than ${unsettledH}h unsettled` },
    failedPay
      ? { level: "warn", title: "Failed payments", detail: `${failedPay} in the last 24 hours` }
      : { level: "ok", title: "Payments", detail: "No failed payments in 24 hours" },
    stuckPay
      ? { level: "warn", title: "Payments stuck pending", detail: `${stuckPay} pending for over ${pendingMin} minutes` }
      : { level: "ok", title: "No stuck payments", detail: `None pending over ${pendingMin} minutes` },
    failedHooks
      ? { level: "warn", title: "Provider callbacks failed", detail: `${failedHooks} webhook events failed to process` }
      : { level: "ok", title: "Provider callbacks", detail: "No failed webhook events" },
    failedJobs
      ? { level: "warn", title: "Background jobs failed", detail: `${failedJobs} failed jobs` }
      : { level: "ok", title: "Background jobs", detail: "No failed jobs recorded" },
  ];

  return {
    alerts,
    providers: [
      { name: "Odds feed", value: odds.name, sandbox: odds.isSandbox, extra: odds.creditsRemaining != null ? `${odds.creditsRemaining} credits left` : "Credits shown after this server's next sync" },
      { name: "Payments", value: pay.name, sandbox: pay.isSandbox, extra: null as string | null },
    ],
    lastSync: syncedAt,
  };
}
