import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { PERMISSIONS, permissionGroups } from "@/lib/permissions";
import { RoleEditor } from "@/components/admin/AdminForms";
import { Head, Icon, Panel, btnGhost } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

/** Roles as a matrix (permission x role) with one editor beside it. Super admin only. */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const gate = await adminPage(["roles.manage"]);
  if (!gate.ok) return gate.deny;
  const { edit } = await searchParams;
  const roles = await prisma.adminRole.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } });
  const perms = Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label }));
  const editing = roles.find((r) => r.id === edit);

  return (
    <>
      <Head title="Roles">
        <Link href="/admin/roles?edit=new#editor" className={btnGhost}>
          <Icon name="plus" />
          New role
        </Link>
      </Head>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Matrix" icon="roles" flush>
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: `${20 + (roles.length + 1) * 7}rem` }}>
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">
                    Permission
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">
                    Super admin
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} scope="col" className="px-2 py-2.5 text-center">
                      <Link href={`/admin/roles?edit=${r.id}#editor`} aria-current={r.id === edit ? "true" : undefined} className={`text-[11px] font-semibold uppercase tracking-[0.08em] hover:text-lime ${r.id === edit ? "text-lime" : "text-white"}`}>
                        {r.name}
                      </Link>
                      <div className="text-[10px] font-normal normal-case text-fog">
                        {r._count.users} admin{r._count.users === 1 ? "" : "s"}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {permissionGroups().map((g) => (
                <tbody key={g.label} className="border-b border-line last:border-0">
                  <tr>
                    <th colSpan={roles.length + 2} scope="colgroup" className="bg-ink-500 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">
                      {g.label}
                    </th>
                  </tr>
                  {g.perms.map((p) => (
                    <tr key={p} className="hover:bg-ink-500">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal" title={PERMISSIONS[p]}>
                        <span className="font-mono text-xs text-white">{p}</span>
                        <span className="block truncate text-xs text-fog">{PERMISSIONS[p]}</span>
                      </th>
                      <td className="px-2 text-center">
                        <Cell on />
                      </td>
                      {roles.map((r) => (
                        <td key={r.id} className={`px-2 text-center ${r.id === edit ? "bg-lime/[0.04]" : ""}`}>
                          <Cell on={r.permissions.includes(p)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Panel>

        <div id="editor" className="min-w-0 scroll-mt-20">
          <Panel title={editing ? `Edit ${editing.name}` : "New role"} icon={editing ? "roles" : "plus"}>
            {/* key resets the client form when switching roles */}
            <RoleEditor key={editing?.id ?? "new"} perms={perms} role={editing} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Cell({ on }: { on?: boolean }) {
  return on ? (
    <span className="inline-grid h-5 w-5 place-items-center rounded-sm bg-lime/15 text-lime">
      <Icon name="check" className="h-3.5 w-3.5" />
      <span className="sr-only">yes</span>
    </span>
  ) : (
    <span className="inline-block h-1 w-1 rounded-full bg-fog/30">
      <span className="sr-only">no</span>
    </span>
  );
}
