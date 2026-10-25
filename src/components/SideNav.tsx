"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { UiCompetition } from "@/lib/queries";
import { Crest } from "./Crest";
import { SportIcon } from "./SportIcon";

export interface NavData {
  sports: { key: string; name: string; count: number }[];
  competitions: UiCompetition[];
  liveCount: number;
}

/** Desktop left rail: sports, live, and competitions with their official badges. */
export function SideNav({ data }: { data: NavData }) {
  const path = usePathname();
  const params = useSearchParams();
  const sport = params.get("sport");
  const comp = params.get("comp");
  const onHome = path === "/";
  const total = data.sports.reduce((n, s) => n + s.count, 0);

  return (
    <nav aria-label="Sports and competitions" className="card overflow-hidden">
      <Section title="Sports">
        <NavItem href="/" active={onHome && !sport && !comp && !params.get("q") && !params.get("hours")} icon={<SportIcon sport="all" />} label="All sports" count={total} />
        <NavItem href="/live" active={path === "/live"} icon={<SportIcon sport="live" className="h-5 w-5 text-danger" />} label="Live" count={data.liveCount} />
        {data.sports.map((s) => (
          <NavItem key={s.key} href={`/?sport=${s.key}`} active={onHome && sport === s.key} icon={<SportIcon sport={s.key} />} label={s.name} count={s.count} />
        ))}
      </Section>

      <Section title="Popular">
        {[
          { h: 3, label: "Next 3 hours" },
          { h: 24, label: "Next 24 hours" },
        ].map((x) => (
          <NavItem key={x.h} href={`/?hours=${x.h}`} active={onHome && params.get("hours") === String(x.h) && !sport && !comp} icon={<SportIcon sport="clock" />} label={x.label} />
        ))}
        <NavItem href="/results" active={path === "/results"} icon={<SportIcon sport="results" />} label="Results" />
      </Section>

      {data.competitions.length > 0 && (
        <Section title="Competitions">
          {data.competitions.map((c) => (
            <NavItem key={c.id} href={`/?comp=${c.id}`} active={onHome && comp === c.id} icon={<Crest name={c.name} src={c.badgeUrl} size="xs" />} label={c.name} count={c.count} />
          ))}
        </Section>
      )}
    </nav>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line last:border-0">
      <h2 className="bg-ink-600/50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-fog-muted">{title}</h2>
      <ul className="p-1.5">{children}</ul>
    </div>
  );
}

function NavItem({ href, active, icon, label, count }: { href: string; active: boolean; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm font-semibold transition ${
          active ? "bg-lime/10 text-lime before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-lime" : "text-fog hover:bg-ink-600/60 hover:text-white"
        }`}
      >
        <span className="grid w-5 place-items-center">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {!!count && <span className={`text-xs tabular-nums ${active ? "font-bold" : "text-fog-muted"}`}>{count}</span>}
      </Link>
    </li>
  );
}
