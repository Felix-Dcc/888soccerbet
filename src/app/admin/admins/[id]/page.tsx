import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { can, effectivePermissions, PERMISSIONS, permissionGroups, type Permission } from "@/lib/permissions";
import { parseRange } from "@/lib/adminAnalytics";
import { formatReferralCode } from "@/lib/admins";
import { AdminAccessEditor, AdminActions, AdminBalanceCredit, AdminClearHistory } from "@/components/admin/AdminForms";
import { userCashBalance } from "@/lib/ledger";
import { formatPesewas } from "@/lib/money";
import { ReferralDashboard } from "@/components/admin/ReferralDashboard";
import { Avatar, EmptyState, Icon, Panel, Pill, Range, ago, statusTone, when } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

/** One administrator: who they are, exactly what they can do and why, what they did, and their referral performance. */
export default async function AdminProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["admins.view"]);
  if (!gate.ok) return gate.deny;
  const u = gate.user;
  const { id } = await params;
  const sp = await searchParams;
  const range = parseRange(sp);
  const admin = await prisma.user.findFirst({ where: { id, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, include: { adminRole: true } });
  if (!admin) notFound();
  const [roles, actions, balance] = await Promise.all([
    prisma.adminRole.findMany({ orderBy: { name: "asc" } }),
    can(u, "audit_logs.view") ? prisma.auditLog.findMany({ where: { actorUserId: admin.id }, orderBy: { seq: "desc" }, take: 12 }) : Promise.resolve(null),
    userCashBalance(prisma, admin.id),
  ]);
  const manage = can(u, "admins.manage") && u.id !== admin.id;
  const has = effectivePermissions(admin);
  const fromRole = new Set(admin.adminRole?.permissions ?? []);
  const source = (p: Permission) => {
    if (admin.role === "SUPER_ADMIN") return { on: true, why: "super admin" };
    if (admin.permDenials.includes(p) && fromRole.has(p)) return { on: false, why: "removed" };
    if (has.has(p)) return { on: true, why: fromRole.has(p) ? "role" : "granted" };
    return { on: false, why: "" };
  };
  const name = admin.displayName ?? admin.email;

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-white/[0.06] pb-4">
        <Avatar name={name} size="h-12 w-12 text-sm" />
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h1 className="truncate font-display text-[22px] font-bold text-white">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fog">
            <Pill tone={statusTone(admin.status)}>{admin.status.toLowerCase()}</Pill>
            {admin.role === "SUPER_ADMIN" ? <Pill tone="info">super admin</Pill> : <Pill tone="neutral">{admin.adminRole?.name ?? "custom access"}</Pill>}
            <span>{admin.email}</span>
            {admin.adminUsername && <span>@{admin.adminUsername}</span>}
            <span className="font-mono">{formatReferralCode(admin.referralCode, true)}</span>
            <span>Last login {ago(admin.lastLoginAt)}</span>
          </div>
        </div>
        <Range path={`/admin/admins/${admin.id}`} current={range.key} />
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Access" icon="lock" actions={<span className="text-xs text-fog">{has.size} of {Object.keys(PERMISSIONS).length}</span>}>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {permissionGroups().map(({ label, perms }) => (
              <div key={label}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">{label}</div>
                <ul className="space-y-1">
                  {perms.map((p) => {
                    const s = source(p);
                    return (
                      <li key={p} className="flex items-center gap-2 text-sm" title={PERMISSIONS[p]}>
                        <span className={`grid h-4 w-4 place-items-center rounded-sm ${s.on ? "bg-lime/15 text-lime" : "bg-white/[0.05] text-fog/50"}`}>
                          <Icon name={s.on ? "check" : "lock"} className="h-3 w-3" />
                        </span>
                        <span className={`min-w-0 flex-1 truncate font-mono text-xs ${s.on ? "text-white" : "text-fog/70"}`}>{p.split(".")[1]}</span>
                        {s.why && <span className={`text-[10px] uppercase tracking-wide ${s.why === "removed" ? "text-[#FF8A8D]" : "text-fog"}`}>{s.why}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {manage && (
            <details className="group mt-5 border-t border-white/[0.06] pt-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-lime [&::-webkit-details-marker]:hidden">
                <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-90" />
                Edit access
              </summary>
              <div className="mt-4">
                <AdminAccessEditor
                  adminId={admin.id}
                  perms={Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label }))}
                  roles={roles}
                  initial={{ role: admin.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN", adminRoleId: admin.adminRoleId, permGrants: admin.permGrants, permDenials: admin.permDenials }}
                />
              </div>
            </details>
          )}
          {u.id === admin.id && <p className="mt-4 text-sm text-fog">This is you. Another super admin has to change your access.</p>}
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel title="Balance" icon="coins" actions={<span className="font-display text-lg font-bold tabular-nums text-lime">GHS {formatPesewas(balance)}</span>}>
            {can(u, "wallets.adjust") ? (
              <AdminBalanceCredit adminId={admin.id} email={admin.email} />
            ) : (
              <p className="text-sm text-fog">The account's cash balance for betting.</p>
            )}
          </Panel>
          <Panel title="Financial history" icon="audit">
            <p className="mb-3 text-sm text-fog">Clear this admin&apos;s settled transaction records. Balances and the ledger stay as they are; pending items are kept.</p>
            <AdminClearHistory adminId={admin.id} email={admin.email} />
          </Panel>
          {manage && (
            <Panel title="Account" icon="team">
              <AdminActions adminId={admin.id} email={admin.email} status={admin.status} />
            </Panel>
          )}
          {actions && (
            <Panel title="Recent actions" icon="audit" flush actions={<Link href={`/admin/audit?actor=${admin.id}`} className="text-xs font-semibold text-lime hover:underline">All →</Link>}>
              {actions.length === 0 ? (
                <EmptyState icon="audit" title="No recorded actions" />
              ) : (
                <ol className="divide-y divide-white/[0.05]">
                  {actions.map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0 truncate font-mono text-xs text-white">{a.action}</span>
                      <span className="shrink-0 text-xs text-fog">{when(a.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}
        </div>
      </div>

      <ReferralDashboard admin={admin} range={range} playersLinkable={can(u, "users.view") || can(u, "referrals.view_all")} path={`/admin/admins/${admin.id}`} q={sp.q} />
    </>
  );
}
