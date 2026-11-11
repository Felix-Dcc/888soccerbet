import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can, PERMISSIONS } from "@/lib/permissions";
import { adminComparison, parseRange } from "@/lib/adminAnalytics";
import { CreateAdminForm } from "@/components/admin/AdminForms";
import { Avatar, Figure, Grid, Head, Icon, Light, Panel, Pill, Range, Strip, TERMS, ago, btnGhost, ghs, ghsShort, td, tdNum } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const SORTS = { players: "Users", ggr: "Gross revenue", today: "Today", deposits: "Deposits", login: "Last login" } as const;
type Sort = keyof typeof SORTS;

/** The team: every administrator's access and referral performance; super admins add people here. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["admins.view"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const sp = await searchParams;
  const range = parseRange(sp);
  const manage = can(u, "admins.manage");
  const sorts = (Object.keys(SORTS) as Sort[]).filter((s) => s !== "today" || manage); // today's revenue: super admins only
  const sort: Sort = sorts.find((s) => s === sp.sort) ?? "players";
  // Today = since midnight in Ghana (UTC+0, no DST), so it starts again from zero every day.
  const today = parseRange({ range: "today" });
  const [rows, roles, players, settings, todayRows] = await Promise.all([
    adminComparison(range),
    prisma.adminRole.findMany({ orderBy: { name: "asc" } }),
    prisma.user.count({ where: { role: "USER" } }),
    prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { defaultCommissionBp: true } }),
    manage && range.key !== "today" ? adminComparison(today) : null,
  ]);
  const todayGgr = new Map((manage ? (todayRows ?? rows) : []).map((a) => [a.id, a.metrics.revenue.ggr]));
  const todayOf = (id: string) => todayGgr.get(id) ?? 0n;
  const by: Record<Sort, (a: (typeof rows)[number]) => number> = {
    players: (a) => a.metrics.players.total,
    ggr: (a) => Number(a.metrics.revenue.ggr),
    today: (a) => Number(todayOf(a.id)),
    deposits: (a) => Number(a.metrics.money.deposits.total),
    login: (a) => a.lastLoginAt?.getTime() ?? 0,
  };
  const sorted = [...rows].sort((a, b) => by[sort](b) - by[sort](a));
  const referred = rows.reduce((n, a) => n + a.metrics.players.total, 0);
  const maxPlayers = Math.max(1, ...rows.map((a) => a.metrics.players.total));
  const sortHref = (s: Sort) => `/admin/admins?${new URLSearchParams({ range: range.key, sort: s })}`;

  return (
    <>
      <Head title="Team">
        <Range path="/admin/admins" current={range.key} params={{ sort }} />
        {can(u, "reports.export") && (
          <a href={`/api/admin/export?kind=admins&range=${range.key}`} className={btnGhost}>
            <Icon name="download" />
            Export
          </a>
        )}
      </Head>

      <Strip cols={manage ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-4"}>
        <Figure label="Administrators" value={rows.length} note={`${rows.filter((a) => a.status === "ACTIVE").length} active · ${rows.filter((a) => a.role === "SUPER_ADMIN").length} super`} />
        <Figure label="Users via admins" value={referred} note={`of ${players} users`} />
        <Figure label="Direct or user-referred" value={players - referred} title="Users not attributed to any administrator" />
        <Figure label="Gross revenue via admins" title={TERMS.gross} value={ghsShort(rows.reduce((n, a) => n + a.metrics.revenue.ggr, 0n))} note="selected range" />
        {manage && (
          <Figure
            label="Revenue today via admins"
            title="Gross revenue from admins' referred users since midnight (Ghana time); starts again from zero every day"
            value={ghsShort([...todayGgr.values()].reduce((n, g) => n + g, 0n))}
            note="since midnight · resets daily"
          />
        )}
      </Strip>

      {can(u, "admins.manage") && (
        <details className="group rounded-2xl border border-line bg-ink-700 shadow-card" open={sp.add === "1"}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-fog [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Icon name="plus" className="h-4 w-4 text-lime" />
              Add an administrator
            </span>
            <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-90" />
          </summary>
          <div className="border-t border-line p-4">
            <CreateAdminForm perms={Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label }))} roles={roles} defaultCommissionBp={settings?.defaultCommissionBp ?? 0} />
          </div>
        </details>
      )}

      <Panel
        title="Roster"
        icon="team"
        flush
        actions={
          <nav aria-label="Sort" className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-fog">Sort</span>
            {sorts.map((s) => (
              <Link key={s} href={sortHref(s)} aria-current={s === sort ? "true" : undefined} className={`rounded px-2 py-1 font-semibold ${s === sort ? "bg-ink-500 text-white" : "text-fog hover:text-white"}`}>
                {SORTS[s]}
              </Link>
            ))}
          </nav>
        }
      >
        <Grid
          head={["Administrator", "Access", "Code", "Users", "New", "Deposits", "Stakes", "Gross revenue", ...(manage ? ["Revenue today"] : []), "Last login"]}
          right={manage ? [4, 5, 6, 7, 8] : [4, 5, 6, 7]}
          minWidth={manage ? "74rem" : "68rem"}
        >
          {sorted.map((a) => (
            <tr key={a.id}>
              <td className={td}>
                <Link href={`/admin/admins/${a.id}`} className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={a.displayName ?? a.email} size="h-8 w-8 text-[11px]" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 break-all font-semibold text-white hover:text-lime">
                      <Light level={a.status === "ACTIVE" ? "ok" : "critical"} />
                      {a.displayName ?? a.email}
                    </span>
                    <span className="block break-all text-xs text-fog">{a.email}</span>
                  </span>
                </Link>
              </td>
              <td className={td}>{a.role === "SUPER_ADMIN" ? <Pill tone="info">super admin</Pill> : <Pill tone="neutral">{a.adminRole?.name ?? "custom"}</Pill>}</td>
              <td className={`${td} font-mono text-xs text-fog`}>{a.referralCode}</td>
              <td className={td}>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-500">
                    <span className="block h-full rounded-full bg-lime" style={{ width: `${(a.metrics.players.total / maxPlayers) * 100}%` }} />
                  </span>
                  <span className="tabular-nums text-white">{a.metrics.players.total}</span>
                </div>
              </td>
              <td className={`${tdNum} text-fog`}>{a.metrics.players.newInRange}</td>
              <td className={`${tdNum} text-white`}>{ghs(a.metrics.money.deposits.total)}</td>
              <td className={`${tdNum} text-white`}>{ghs(a.metrics.betting.placed.stakes)}</td>
              <td className={`${tdNum} ${a.metrics.revenue.ggr < 0n ? "text-danger" : "text-white"}`}>{ghs(a.metrics.revenue.ggr)}</td>
              {manage && <td className={`${tdNum} font-semibold ${todayOf(a.id) < 0n ? "text-danger" : "text-lime"}`}>{ghs(todayOf(a.id))}</td>}
              <td className={`${td} whitespace-nowrap text-fog`}>{ago(a.lastLoginAt)}</td>
            </tr>
          ))}
        </Grid>
      </Panel>
    </>
  );
}
