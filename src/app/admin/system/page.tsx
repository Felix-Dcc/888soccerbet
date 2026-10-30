import Link from "next/link";
import { prisma } from "@/lib/db";
import { adminPage } from "@/lib/adminPage";
import { systemHealth } from "@/lib/systemHealth";
import { EmptyState, Grid, Head, Light, Panel, Pill, ago, td, when } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

/** Status board: every live check as a tile, the providers, and the latest provider callbacks. */
export default async function SystemPage() {
  const gate = await adminPage(["system.view"]);
  if (!gate.ok) return gate.deny;
  const [h, hooks] = await Promise.all([systemHealth(), prisma.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 15 })]);
  const bad = h.alerts.filter((a) => a.level !== "ok");
  const worst = bad.some((a) => a.level === "critical") ? "critical" : bad.length ? "warn" : "ok";

  return (
    <>
      <Head title="System">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Light level={worst} pulse={worst !== "ok"} />
          {worst === "ok" ? "All systems normal" : `${bad.length} need attention`}
        </span>
      </Head>

      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-ink-500 sm:grid-cols-2 xl:grid-cols-4">
        {h.alerts.map((a) => {
          const body = (
            <>
              <span className="flex items-center gap-2">
                <Light level={a.level} pulse={a.level === "critical"} />
                <span className="font-semibold text-white">{a.title}</span>
                <span className="sr-only">({a.level})</span>
              </span>
              <span className="mt-1 block text-xs text-fog">{a.detail}</span>
            </>
          );
          const tile = `block h-full px-4 py-3 ${a.level === "critical" ? "bg-danger/10" : a.level === "warn" ? "bg-warn/10" : "bg-ink-700"}`;
          return a.href && a.level !== "ok" ? (
            <Link key={a.title} href={a.href} className={`${tile} hover:brightness-125`}>
              {body}
            </Link>
          ) : (
            <div key={a.title} className={tile}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Providers" icon="system">
          <dl className="divide-y divide-line text-sm">
            {h.providers.map((p) => (
              <div key={p.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
                <dt className="text-fog">{p.name}</dt>
                <dd className="flex flex-wrap items-center gap-2 text-white">
                  {p.value}
                  {p.sandbox ? <Pill tone="warn">sandbox</Pill> : <Pill tone="good">live</Pill>}
                  {p.extra && <span className="w-full text-right text-xs text-fog">{p.extra}</span>}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between py-2.5 last:pb-0">
              <dt className="text-fog">Last odds sync</dt>
              <dd className="text-white" title={when(h.lastSync)}>
                {ago(h.lastSync)}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Provider callbacks" icon="link" flush>
          {hooks.length === 0 ? (
            <EmptyState icon="link" title="No callbacks yet" />
          ) : (
            <Grid head={["Received", "Provider", "Event", "Status"]} minWidth="32rem">
              {hooks.map((w) => (
                <tr key={w.id} title={w.error ?? undefined}>
                  <td className={`${td} whitespace-nowrap text-fog`}>{when(w.receivedAt)}</td>
                  <td className={`${td} text-white`}>{w.provider}</td>
                  <td className={`${td} font-mono text-xs text-fog`}>{w.providerEventId.slice(0, 24)}</td>
                  <td className={td}>
                    <Pill tone={w.status === "PROCESSED" ? "good" : w.status === "FAILED" ? "bad" : "neutral"}>{w.status.toLowerCase()}</Pill>
                  </td>
                </tr>
              ))}
            </Grid>
          )}
        </Panel>
      </div>
    </>
  );
}
