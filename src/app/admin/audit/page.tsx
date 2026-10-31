import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { verifyAuditChain } from "@/lib/audit";
import { EmptyState, Head, Icon, Light, Pager, Panel, btnPrimary, clock, day, field, pageOf } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const PAGE = 40;
const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v, null, 2));

/** The tamper-evident audit log as a day-grouped timeline; each entry expands to its before/after values. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["audit_logs.view"]);
  if (!gate.ok) return gate.deny;
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const action = sp.action?.trim().toUpperCase().slice(0, 60) || undefined;
  const actor = sp.actor?.trim().slice(0, 40) || undefined;
  const where: Prisma.AuditLogWhereInput = { ...(action ? { action: { contains: action } } : {}), ...(actor ? { actorUserId: actor } : {}) };
  const [total, rows, chain, actors] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { seq: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { actor: { select: { email: true, displayName: true } } } }),
    verifyAuditChain(),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true, email: true }, orderBy: { email: "asc" } }),
  ]);
  const days = rows.reduce<{ day: string; rows: typeof rows }[]>((out, r) => {
    const d = day(r.createdAt);
    if (out.at(-1)?.day === d) out.at(-1)!.rows.push(r);
    else out.push({ day: d, rows: [r] });
    return out;
  }, []);

  return (
    <>
      <Head title="Audit trail" />

      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${chain.ok ? "border-lime/20 bg-lime/[0.05]" : "border-danger/40 bg-danger/10"}`} role="status">
        <Light level={chain.ok ? "ok" : "critical"} pulse={!chain.ok} />
        <span className="font-semibold text-white">{chain.ok ? "Chain intact" : `Chain broken at entry #${chain.brokenAtSeq}`}</span>
        <span className="text-fog">{chain.checked} entries verified</span>
      </div>

      <Panel flush>
        <form role="search" className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
          <div className="min-w-44 flex-1">
            <label htmlFor="aa" className="mb-1 block text-xs font-semibold text-fog">
              Action
            </label>
            <input id="aa" name="action" defaultValue={action ?? ""} placeholder="ADMIN_, SETTLE, PLAYER_" className={`${field} w-full`} />
          </div>
          <div className="min-w-44 flex-1">
            <label htmlFor="ab" className="mb-1 block text-xs font-semibold text-fog">
              By
            </label>
            <select id="ab" name="actor" defaultValue={actor ?? ""} className={`${field} w-full`}>
              <option value="">Anyone</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
          <button className={btnPrimary}>
            <Icon name="search" />
            Filter
          </button>
          {(action || actor) && (
            <Link href="/admin/audit" className="h-9 px-2 text-sm leading-9 text-fog hover:text-white">
              Clear
            </Link>
          )}
          <span className="ml-auto self-center text-xs tabular-nums text-fog">
            {total} entr{total === 1 ? "y" : "ies"}
          </span>
        </form>

        {rows.length === 0 ? (
          <EmptyState icon="audit" title="No entries match" />
        ) : (
          days.map((d) => (
            <section key={d.day}>
              <h2 className="sticky top-16 z-[1] border-b border-line bg-ink-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">{d.day}</h2>
              <ol className="divide-y divide-line">
                {d.rows.map((r) => {
                  const before = json(r.before);
                  const after = json(r.after);
                  const meta = json(r.metadata);
                  return (
                    <li key={r.id}>
                      <details className="group">
                        <summary className="grid cursor-pointer list-none grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-ink-500 sm:grid-cols-[4.5rem_minmax(0,14rem)_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
                          <span className="text-xs tabular-nums text-fog">{clock(r.createdAt)}</span>
                          <span className="truncate font-mono text-xs font-semibold text-white">{r.action}</span>
                          <span className="col-start-2 truncate text-xs text-fog sm:col-start-auto">
                            {r.actor ? (r.actor.displayName ?? r.actor.email) : "system"}
                            {r.targetType && (
                              <>
                                {" "}
                                → {r.targetType} <span className="font-mono">{r.targetId?.slice(0, 12)}</span>
                              </>
                            )}
                          </span>
                          <span className="hidden items-center gap-1 text-[11px] tabular-nums text-fog sm:flex">
                            #{r.seq}
                            <Icon name="chevron" className="h-3.5 w-3.5 transition group-open:rotate-90" />
                          </span>
                        </summary>
                        <div className="grid gap-3 border-t border-line bg-ink-600 px-4 py-3 md:grid-cols-3">
                          {[
                            ["Before", before],
                            ["After", after],
                            ["Details", meta],
                          ].map(([label, v]) => (
                            <div key={label} className="min-w-0">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">{label}</div>
                              {v ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink-900 p-2.5 font-mono text-[11px] text-fog">{v}</pre> : <span className="text-xs text-fog/60">—</span>}
                            </div>
                          ))}
                          <div className="text-[11px] text-fog md:col-span-3">
                            #{r.seq}
                            {r.ip && ` · ${r.ip}`}
                            {r.hash && <span className="font-mono"> · {r.hash.slice(0, 16)}</span>}
                          </div>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
        <Pager path="/admin/audit" page={page} pages={Math.ceil(total / PAGE)} params={{ action, actor }} />
      </Panel>
    </>
  );
}
