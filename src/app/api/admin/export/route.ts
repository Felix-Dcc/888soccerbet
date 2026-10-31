import { HttpError, requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { parseRange, adminComparison } from "@/lib/adminAnalytics";
import { formatPesewas } from "@/lib/money";
import { clientIp, errorResponse } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** CSV cell: quoted, and a leading = + - @ neutralised so spreadsheets don't run it as a formula. */
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "bigint" ? formatPesewas(v).replace(/,/g, "") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/**
 * GET /api/admin/export?kind=players|bets|payments|admins&range=30d
 * Needs reports.export. With reports.view the export covers everyone; otherwise only the
 * admin's own referred players. Admin lists need admins.view.
 */
export async function GET(req: Request) {
  try {
    const actor = await requirePermission("reports.export");
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") ?? "";
    const range = parseRange(Object.fromEntries(url.searchParams));
    const global = can(actor, "reports.view");
    if (!global && !can(actor, "referrals.view")) throw new HttpError(403, "forbidden");
    const players = global ? { role: "USER" as const } : { role: "USER" as const, referredById: actor.id };
    const when = { gte: range.from, lt: range.to };

    let body: string;
    if (kind === "players") {
      const rows = await prisma.user.findMany({
        where: { ...players, createdAt: when },
        orderBy: { createdAt: "desc" },
        take: 50_000,
        select: { id: true, email: true, phone: true, status: true, kycStatus: true, createdAt: true, referralSource: true, referredAt: true, referredBy: { select: { email: true } } },
      });
      body = csv(
        ["id", "email", "phone", "status", "verification", "registered_at", "referred_by", "referral_source", "referred_at"],
        rows.map((u) => [u.id, u.email, u.phone, u.status, u.kycStatus, u.createdAt, u.referredBy?.email, u.referralSource, u.referredAt]),
      );
    } else if (kind === "bets") {
      const rows = await prisma.bet.findMany({
        where: { user: players, placedAt: when },
        orderBy: { placedAt: "desc" },
        take: 50_000,
        select: { ref: true, type: true, status: true, stake: true, combinedMilliOdds: true, potentialPayout: true, placedAt: true, settledAt: true, user: { select: { email: true } } },
      });
      body = csv(
        ["ref", "player", "type", "status", "stake_ghs", "odds", "payout_ghs", "placed_at", "settled_at"],
        rows.map((b) => [b.ref, b.user.email, b.type, b.status, b.stake, (b.combinedMilliOdds / 1000).toFixed(2), b.potentialPayout, b.placedAt, b.settledAt]),
      );
    } else if (kind === "payments") {
      const rows = await prisma.paymentIntent.findMany({
        where: { user: players, createdAt: when },
        orderBy: { createdAt: "desc" },
        take: 50_000,
        select: { ref: true, direction: true, status: true, amount: true, provider: true, createdAt: true, metadata: true, user: { select: { email: true } } },
      });
      // Payment references only: no mobile money numbers or provider credentials in exports.
      body = csv(
        ["ref", "player", "direction", "purpose", "status", "amount_ghs", "provider", "created_at"],
        rows.map((p) => [p.ref, p.user.email, p.direction, (p.metadata as { purpose?: string } | null)?.purpose ?? "", p.status, p.amount, p.provider, p.createdAt]),
      );
    } else if (kind === "admins") {
      if (!can(actor, "admins.view")) throw new HttpError(403, "forbidden");
      const rows = await adminComparison(range);
      body = csv(
        ["email", "username", "role", "status", "referral_code", "referred_players", "new_in_range", "verified", "deposits_ghs", "withdrawals_ghs", "stakes_ghs", "gross_revenue_ghs", "last_login"],
        rows.map((a) => [a.email, a.adminUsername, a.role, a.status, a.referralCode, a.metrics.players.total, a.metrics.players.newInRange, a.metrics.players.verified, a.metrics.money.deposits.total, a.metrics.money.withdrawals.total, a.metrics.betting.placed.stakes, a.metrics.revenue.ggr, a.lastLoginAt]),
      );
    } else throw new HttpError(400, "Unknown export");

    await audit({ actorUserId: actor.id, action: "REPORT_EXPORT", targetType: "Export", targetId: kind, metadata: { range: range.key, from: range.from, to: range.to, scope: global ? "all" : "own-referrals" }, ip: clientIp(req) });
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="888soccerbet-${kind}-${range.from.toISOString().slice(0, 10)}-to-${new Date(range.to.getTime() - 1).toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
