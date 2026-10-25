import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { playerScopeWhere } from "@/lib/playerScope";
import { normaliseCode } from "@/lib/ids";
import { Avatar, EmptyState, Grid, Head, Icon, Pager, Panel, Pill, Tabs, ago, btnGhost, btnPrimary, field, ghs, pageOf, statusTone, td, tdNum, when } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const PAGE = 30;
const VERIFY = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;

/** Player search and triage. Which players appear is decided in the database query, per permission. */
export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["users.view", "referrals.view", "referrals.view_all"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const sp = await searchParams;
  const scope = playerScopeWhere(u);
  if (!scope)
    return (
      <Panel>
        <EmptyState icon="lock" title="No player access" />
      </Panel>
    );
  const q = sp.q?.trim().slice(0, 80) ?? "";
  const status = sp.status === "ACTIVE" || sp.status === "SUSPENDED" ? sp.status : undefined;
  const kyc = VERIFY.find((v) => v === sp.kyc);
  const oldest = sp.sort === "oldest";
  const page = pageOf(sp.page);
  const search: Prisma.UserWhereInput = q
    ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }, { id: q }, { referralCode: normaliseCode(q) }] }
    : {};
  const base: Prisma.UserWhereInput = { AND: [scope, search, kyc ? { kycStatus: kyc } : {}] };
  const where: Prisma.UserWhereInput = { AND: [base, status ? { status } : {}] };
  const [total, counts, players] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: oldest ? "asc" : "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, email: true, phone: true, status: true, kycStatus: true, createdAt: true, referredBy: { select: { email: true, displayName: true } } },
    }),
  ]);
  const ids = players.map((p) => p.id);
  const [cash, bets] = ids.length
    ? await Promise.all([
        prisma.$queryRaw<{ userId: string; bal: bigint }[]>`
          SELECT a."userId", COALESCE(SUM(e.amount),0)::bigint AS bal FROM "LedgerAccount" a LEFT JOIN "LedgerEntry" e ON e."accountId" = a.id
          WHERE a.kind = 'USER_CASH' AND a."userId" = ANY(${ids}) GROUP BY a."userId"`,
        prisma.bet.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: true, _max: { placedAt: true } }),
      ])
    : [[], []];
  const balance = new Map(cash.map((c) => [c.userId, c.bal]));
  const betStats = new Map(bets.map((b) => [b.userId, b]));
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const all = counts.reduce((n, c) => n + c._count, 0);
  const keep = { q: q || undefined, kyc, sort: oldest ? "oldest" : undefined };
  const href = (s?: string) => `/admin/users?${new URLSearchParams(Object.entries({ ...keep, status: s }).filter((e): e is [string, string] => !!e[1]))}`;

  return (
    <>
      <Head title="Players">
        {can(u, "reports.export") && (
          <a href="/api/admin/export?kind=players&range=all" className={btnGhost}>
            <Icon name="download" />
            Export
          </a>
        )}
      </Head>

      <Panel flush>
        <Tabs
          current={status ?? "all"}
          tabs={[
            { key: "all", label: "All", href: href(), count: all },
            { key: "ACTIVE", label: "Active", href: href("ACTIVE"), count: count("ACTIVE") },
            { key: "SUSPENDED", label: "Suspended", href: href("SUSPENDED"), count: count("SUSPENDED") },
          ]}
        />
        <form role="search" className="flex flex-wrap items-end gap-2 border-b border-white/[0.06] px-4 py-3">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="min-w-52 flex-1">
            <label htmlFor="pq" className="mb-1 block text-xs font-semibold text-fog">
              Search
            </label>
            <input id="pq" name="q" defaultValue={q} placeholder="Email, phone, player ID, referral code" className={`${field} w-full`} />
          </div>
          <div>
            <label htmlFor="pk" className="mb-1 block text-xs font-semibold text-fog">
              Verification
            </label>
            <select id="pk" name="kyc" defaultValue={kyc ?? ""} className={field}>
              <option value="">Any</option>
              {VERIFY.map((v) => (
                <option key={v} value={v}>
                  {v.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="po" className="mb-1 block text-xs font-semibold text-fog">
              Order
            </label>
            <select id="po" name="sort" defaultValue={oldest ? "oldest" : ""} className={field}>
              <option value="">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          <button className={btnPrimary}>
            <Icon name="search" />
            Apply
          </button>
        </form>
        {players.length === 0 ? (
          <EmptyState icon="search" title="No players match">
            Try a different search or filter.
          </EmptyState>
        ) : (
          <Grid head={["Player", "Joined", "Status", "Verification", "Balance", "Bets", "Last bet", "Referred by"]} right={[4, 5]} minWidth="60rem">
            {players.map((p) => {
              const b = betStats.get(p.id);
              return (
                <tr key={p.id}>
                  <td className={td}>
                    <Link href={`/admin/users/${p.id}`} className="flex items-center gap-2.5">
                      <Avatar name={p.email} size="h-7 w-7 text-[10px]" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white hover:text-lime">{p.email}</span>
                        {can(u, "users.view") && p.phone && <span className="block text-xs tabular-nums text-fog">{p.phone}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap text-fog`}>{when(p.createdAt)}</td>
                  <td className={td}>
                    <Pill tone={statusTone(p.status)}>{p.status.toLowerCase()}</Pill>
                  </td>
                  <td className={`${td} text-fog`}>{p.kycStatus.toLowerCase()}</td>
                  <td className={`${tdNum} text-white`}>{ghs(balance.get(p.id) ?? 0n)}</td>
                  <td className={`${tdNum} text-fog`}>{b?._count ?? 0}</td>
                  <td className={`${td} whitespace-nowrap text-fog`}>{b?._max.placedAt ? ago(b._max.placedAt) : "—"}</td>
                  <td className={`${td} text-fog`}>{p.referredBy ? (p.referredBy.displayName ?? p.referredBy.email) : "—"}</td>
                </tr>
              );
            })}
          </Grid>
        )}
        <Pager path="/admin/users" page={page} pages={Math.ceil(total / PAGE)} params={{ ...keep, status }} />
      </Panel>
    </>
  );
}
