/**
 * Admin design kit: the control-room look shared by every admin page (dark graphite surfaces,
 * hairline borders, dense figures). Pieces are deliberately small so each page composes its own
 * layout instead of filling one template. Server-safe and client-safe: no hooks, no server imports. Every figure is passed in from
 * real data; nothing here invents values.
 */
import Link from "next/link";
import { formatPesewas } from "@/lib/money";

// Kept here, not in adminAnalytics: client components import this kit, and that module pulls in Prisma.
const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
] as const;

export const ghs = (p: bigint) => `GHS ${formatPesewas(p)}`;
/** Compact money for dense places: 12.4k, 1.2m. */
export const ghsShort = (p: bigint) => {
  const v = Number(p) / 100;
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(v / 1e6).toFixed(2)}m` : a >= 1e4 ? `${(v / 1e3).toFixed(1)}k` : v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `GHS ${s}`;
};
const ACCRA = "Africa/Accra";
export const when = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: ACCRA, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d) : "—";
export const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: ACCRA, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
export const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
export function ago(d: Date | null | undefined, now = Date.now()) {
  if (!d) return "never";
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ---------------------------------------------------------------- icons */

const PATHS = {
  command: "M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z",
  referral: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21v-1a6 6 0 0 1 9-5.2M17 14v6M14 17h6",
  players: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9",
  desk: "M3 12h4l3-8 4 16 3-8h4",
  team: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4",
  roles: "M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4",
  audit: "M9 3h6l1 2h3v16H5V5h3l1-2zM9 11h6M9 15h4",
  system: "M3 13h4l2-6 4 12 2-6h6",
  alert: "M12 3l10 18H2L12 3zM12 10v5M12 18h.01",
  check: "M5 12l4 4 10-10",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  chevron: "M9 6l6 6-6 6",
  coins: "M12 7c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 4v6c0 1.7 3.6 3 8 3s8-1.3 8-3V4M4 10v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  ticket: "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  plus: "M12 5v14M5 12h14",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------------------------------------------------------------- structure */

/** Page title row: the title, and the controls that act on the whole page. */
export function Head({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
      <h1 className="font-display text-[22px] font-bold tracking-tight text-white">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** A hairline-bordered surface with a compact title bar. */
export function Panel({
  title,
  icon,
  actions,
  children,
  flush = false,
  className = "",
}: {
  title?: React.ReactNode;
  icon?: IconName;
  actions?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-md border border-white/[0.07] bg-[#10151C] ${className}`}>
      {(title || actions) && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2">
          {title && (
            <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fog">
              {icon && <Icon name={icon} className="h-4 w-4 text-lime" />}
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-2 text-sm">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- figures */

/** Change against the previous period of the same length; "—" when there is nothing to compare. */
export function Delta({ cur, prev, invert = false }: { cur: number | bigint; prev: number | bigint | null; invert?: boolean }) {
  if (prev === null) return null;
  const c = Number(cur);
  const p = Number(prev);
  if (p === 0) return <span className="text-xs text-fog">{c === 0 ? "no change" : "new"}</span>;
  const pct = ((c - p) / Math.abs(p)) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-fog">no change</span>;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${good ? "text-lime" : "text-[#FF7A7A]"}`}>
      <Icon name={pct > 0 ? "up" : "down"} className="h-3 w-3" />
      {Math.abs(pct) >= 1000 ? ">999" : Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/** One figure in a strip: label above, value, optional change and note. */
export function Figure({ label, value, delta, note, tone, title }: { label: string; value: React.ReactNode; delta?: React.ReactNode; note?: React.ReactNode; tone?: "good" | "bad"; title?: string }) {
  return (
    <div className="min-w-0 px-4 py-3" title={title}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">{label}</div>
      <div className={`mt-1 truncate font-display text-lg font-bold tabular-nums ${tone === "good" ? "text-lime" : tone === "bad" ? "text-[#FF7A7A]" : "text-white"}`}>{value}</div>
      {(delta || note) && (
        <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-fog">
          {delta}
          {note}
        </div>
      )}
      {title && <span className="sr-only">{title}</span>}
    </div>
  );
}

/** Figures side by side, separated by hairlines (not a grid of cards). */
export function Strip({ children, cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" }: { children: React.ReactNode; cols?: string }) {
  // Hairline separators are the 1px gaps showing the border colour, so wrapping rows stay clean.
  return <div className={`grid ${cols} gap-px overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.07] [&>*]:bg-[#10151C]`}>{children}</div>;
}

/** Tiny trend line from a series of real values. */
export function Spark({ values, color = "rgb(var(--lime))", className = "h-8 w-24" }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(28 - ((v - min) / span) * 26).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Ranked horizontal bars. Values are real; bars are scaled to the largest. */
export function BarList({ rows, color = "#3B82F6", empty = "Nothing yet" }: { rows: { key: string; label: React.ReactNode; value: number; display: string; href?: string }[]; color?: string; empty?: string }) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-fog">{empty}</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-white">{r.label}</span>
              <span className="shrink-0 tabular-nums text-fog">{r.display}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`, background: r.value < 0 ? "#FF7A7A" : color }} />
            </div>
          </>
        );
        return <li key={r.key}>{r.href ? <Link href={r.href} className="block rounded hover:bg-white/[0.03]">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

/** Conversion funnel: each step's share of the first. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value || 0;
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const pct = top ? (s.value / top) * 100 : 0;
        return (
          <li key={s.label} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3 text-sm">
            <span className="truncate text-fog">{s.label}</span>
            <div className="h-6 overflow-hidden rounded-sm bg-white/[0.05]">
              <div className="flex h-full items-center rounded-sm bg-lime/80 px-2 text-xs font-bold text-lime-ink" style={{ width: `${Math.max(top ? pct : 0, s.value ? 6 : 0)}%` }}>
                {s.value}
              </div>
            </div>
            <span className="text-right tabular-nums text-white">{i === 0 ? "" : top ? `${Math.round(pct)}%` : "—"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Proportions of a whole as one stacked bar with a legend (colour never carries meaning alone). */
export function Stack({ parts }: { parts: { label: string; value: number; color: string; display?: string }[] }) {
  const total = parts.reduce((n, p) => n + Math.max(0, p.value), 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-white/[0.05]" role="img" aria-label={parts.map((p) => `${p.label} ${p.display ?? p.value}`).join(", ")}>
        {total > 0 && parts.map((p) => (p.value > 0 ? <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-fog">{p.label}</span>
            <span className="tabular-nums text-white">{p.display ?? p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- status */

export type Level = "ok" | "warn" | "critical" | "idle";
export function Light({ level, pulse = false }: { level: Level; pulse?: boolean }) {
  const c = { ok: "bg-lime", warn: "bg-gold", critical: "bg-[#FF5A5F]", idle: "bg-fog/60" }[level];
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden>
      {pulse && <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${c}`} />}
      <span className={`relative h-2.5 w-2.5 rounded-full ${c}`} />
    </span>
  );
}

export type Tone = "good" | "bad" | "warn" | "info" | "neutral";
export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const cls = {
    good: "bg-lime/10 text-lime ring-lime/25",
    bad: "bg-[#FF5A5F]/10 text-[#FF8A8D] ring-[#FF5A5F]/25",
    warn: "bg-gold/10 text-gold ring-gold/25",
    info: "bg-[#3B82F6]/10 text-[#8DB8FF] ring-[#3B82F6]/25",
    neutral: "bg-white/[0.05] text-fog ring-white/10",
  }[tone];
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${cls}`}>{children}</span>;
}
export const statusTone = (s: string): Tone => (s === "ACTIVE" ? "good" : s === "SUSPENDED" || s === "CLOSED" ? "bad" : "neutral");
export const betTone = (s: string): Tone => (s === "WON" ? "good" : s === "LOST" ? "bad" : s === "PENDING" ? "warn" : "neutral");
export const payTone = (s: string): Tone => (s === "SUCCEEDED" ? "good" : s === "PENDING" ? "warn" : "bad");

/** Initials badge for people (staff and players). */
export function Avatar({ name, size = "h-9 w-9 text-xs" }: { name: string; size?: string }) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const ini = ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className={`grid shrink-0 place-items-center rounded-md font-bold text-white ${size}`} style={{ background: `hsl(${h} 35% 28%)` }} aria-hidden>
      {ini}
    </span>
  );
}

/* ---------------------------------------------------------------- tables & controls */

/** Dense table. Numeric columns are right-aligned by passing their indexes. */
export function Grid({ head, right = [], children, minWidth = "40rem" }: { head: string[]; right?: number[]; children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.08em] text-fog">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`whitespace-nowrap px-4 py-2 font-semibold ${right.includes(i) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05] [&>tr:hover]:bg-white/[0.025]">{children}</tbody>
      </table>
    </div>
  );
}
export const td = "px-4 py-2.5 align-middle";
export const tdNum = "px-4 py-2.5 text-right tabular-nums";

export function EmptyState({ icon = "check", title, children }: { icon?: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-white/[0.04] text-fog">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="font-semibold text-white">{title}</p>
      {children && <div className="max-w-sm text-sm text-fog">{children}</div>}
    </div>
  );
}

/** Segmented date range control; keeps the page's other query parameters. */
export function Range({ path, current, params = {} }: { path: string; current: string; params?: Record<string, string | undefined> }) {
  const href = (range: string) => `${path}?${new URLSearchParams(Object.entries({ ...params, range }).filter((e): e is [string, string] => !!e[1]))}`;
  return (
    <nav aria-label="Date range" className="inline-flex rounded-md border border-white/[0.08] bg-[#0D1218] p-0.5">
      {RANGE_PRESETS.map((r) => (
        <Link
          key={r.key}
          href={href(r.key)}
          aria-current={current === r.key ? "page" : undefined}
          className={`rounded px-2.5 py-1 text-xs font-semibold ${current === r.key ? "bg-white/[0.09] text-white" : "text-fog hover:text-white"}`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

/** Link-based tabs for views within a page (server-rendered, shareable URLs). */
export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Views" className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-2 [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-semibold ${current === t.key ? "text-white" : "text-fog hover:text-white"}`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded bg-white/[0.07] px-1.5 text-[11px] tabular-nums text-fog">{t.count}</span>}
          {current === t.key && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-lime" />}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ path, page, pages, params = {} }: { path: string; page: number; pages: number; params?: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${path}?${new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter((e): e is [string, string] => !!e[1]))}`;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="font-semibold text-lime hover:underline">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="tabular-nums text-fog">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="font-semibold text-lime hover:underline">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
export const pageOf = (raw: string | undefined) => Math.max(1, Math.min(10_000, Number.parseInt(raw ?? "1", 10) || 1));

export const field = "h-9 rounded-md border border-white/[0.09] bg-[#0D1218] px-3 text-sm text-white placeholder:text-fog/70 focus:border-lime focus:outline-none focus:ring-2 focus:ring-lime/25";
export const btnGhost = "inline-flex h-9 items-center gap-1.5 rounded-md border border-white/[0.09] px-3 text-sm font-semibold text-white hover:bg-white/[0.05]";
export const btnPrimary = "inline-flex h-9 items-center gap-1.5 rounded-md bg-lime px-3.5 text-sm font-bold text-lime-ink hover:bg-lime-600 disabled:opacity-50";
