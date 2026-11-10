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
  chart: "M3 3v18h18M7 16l4-4 4 4 5-6",
  badge: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------------------------------------------------------------- glossary */

/** Plain-language meanings for the money terms used across the console (shown on hover/focus). */
export const TERMS = {
  gross: "Gross revenue: what the house keeps from settled bets (stakes lost by users minus winnings and cash outs paid), before bonuses. Also called GGR.",
  net: "Net revenue: gross revenue minus bonuses paid. Also called NGR.",
  margin: "Margin: gross revenue as a share of the stakes on bets settled in this period.",
} as const;

/** A term with a short explanation: dotted underline, shown on hover and on keyboard focus. */
export function Term({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <span tabIndex={0} title={tip} aria-label={tip} className="cursor-help underline decoration-fog-muted decoration-dotted underline-offset-4 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-lime/40">
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- structure */

/** Page title row: the title, an optional one-line description, and the page-wide controls. */
export function Head({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-1">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-white sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-fog">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** A soft, rounded card with a title row. */
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
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-ink-700 shadow-card ${className}`}>
      {(title || actions) && (
        <div className={`flex min-h-14 items-center justify-between gap-3 px-5 py-3 ${flush ? "border-b border-line" : ""}`}>
          {title && (
            <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-white">
              {icon && (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-lime/10 text-lime ring-1 ring-inset ring-lime/15">
                  <Icon name={icon} className="h-4 w-4" />
                </span>
              )}
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-2 text-sm">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : title || actions ? "px-5 pb-5" : "p-5"}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- figures */

/** Change against the previous period of the same length; "—" when there is nothing to compare. */
export function Delta({ cur, prev, invert = false }: { cur: number | bigint; prev: number | bigint | null; invert?: boolean }) {
  if (prev === null) return null;
  const c = Number(cur);
  const p = Number(prev);
  const flat = "inline-flex items-center rounded-full bg-ink-500 px-2 py-0.5 text-[11px] font-medium text-fog";
  if (p === 0) return <span className={flat}>{c === 0 ? "no change" : "new"}</span>;
  const pct = ((c - p) / Math.abs(p)) * 100;
  if (Math.abs(pct) < 0.5) return <span className={flat}>no change</span>;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${good ? "bg-teal/10 text-teal" : "bg-danger/10 text-danger"}`}>
      <Icon name={pct > 0 ? "up" : "down"} className="h-3 w-3" />
      {Math.abs(pct) >= 1000 ? ">999" : Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/** One figure in a strip: label above, value, optional change and note. */
export function Figure({ label, value, delta, note, tone, title }: { label: string; value: React.ReactNode; delta?: React.ReactNode; note?: React.ReactNode; tone?: "good" | "bad"; title?: string }) {
  return (
    <div className="min-w-0 p-4 2xl:p-5" title={title}>
      <div className="truncate text-[13px] font-medium text-fog">{label}</div>
      <div className={`mt-2 truncate font-display text-[22px] font-bold leading-none tracking-tight tabular-nums 2xl:text-[26px] ${tone === "good" ? "text-teal" : tone === "bad" ? "text-danger" : "text-white"}`}>{value}</div>
      {(delta || note) && (
        <div className="mt-3 flex items-center gap-2 truncate text-xs text-fog">
          {delta}
          {note}
        </div>
      )}
      {title && <span className="sr-only">{title}</span>}
    </div>
  );
}

/** Figures side by side, each on its own card. */
export function Strip({ children, cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" }: { children: React.ReactNode; cols?: string }) {
  return <div className={`grid ${cols} gap-3 sm:gap-4 [&>*]:rounded-2xl [&>*]:border [&>*]:border-line [&>*]:bg-ink-700 [&>*]:shadow-card`}>{children}</div>;
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
export function BarList({ rows, color = "rgb(var(--lime))", empty = "Nothing yet" }: { rows: { key: string; label: React.ReactNode; value: number; display: string; href?: string }[]; color?: string; empty?: string }) {
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
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-500">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`, background: r.value < 0 ? "rgb(var(--danger))" : color }} />
            </div>
          </>
        );
        return <li key={r.key}>{r.href ? <Link href={r.href} className="block rounded transition-colors duration-150 hover:bg-ink-500">{inner}</Link> : inner}</li>;
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
            <div className="h-6 overflow-hidden rounded-sm bg-ink-500">
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
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-ink-500" role="img" aria-label={parts.map((p) => `${p.label} ${p.display ?? p.value}`).join(", ")}>
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
  const c = { ok: "bg-teal", warn: "bg-warn", critical: "bg-danger", idle: "bg-fog/60" }[level];
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
    good: "bg-teal/10 text-teal ring-teal/20 before:bg-teal",
    bad: "bg-danger/10 text-danger ring-danger/20 before:bg-danger",
    warn: "bg-warn/10 text-warn ring-warn/20 before:bg-warn",
    info: "bg-lime/10 text-lime ring-lime/20 before:bg-lime",
    neutral: "bg-ink-500 text-fog ring-line before:bg-fog",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset before:h-1.5 before:w-1.5 before:rounded-full before:content-[''] ${cls}`}>
      {children}
    </span>
  );
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
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-ink-700 ${size}`}
      style={{ background: `linear-gradient(135deg, hsl(${h} 55% 52%), hsl(${(h + 40) % 360} 50% 38%))` }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

/* ---------------------------------------------------------------- tables & controls */

/** Stable short id per column set, so each table's mobile labels get their own CSS rules. */
const headKey = (head: string[]) => {
  let h = 0;
  for (const ch of head.join("|")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `tc${h.toString(36)}`;
};

/**
 * Dense table. Numeric columns are right-aligned by passing their indexes.
 * On phones `.table-cards` (globals.css) stacks each row into a card; the per-column labels
 * come from the rules below, so pages don't have to annotate their own cells.
 */
export function Grid({ head, right = [], children, minWidth = "40rem" }: { head: string[]; right?: number[]; children: React.ReactNode; minWidth?: string }) {
  const cls = headKey(head);
  const labels = head.map((h, i) => `.${cls} tbody td:nth-child(${i + 1})::before{content:${JSON.stringify(h)}}`).join("");
  return (
    <div className={`table-cards ${cls} relative overflow-x-auto`}>
      <style>{`@media (max-width:767px){${labels}}`}</style>
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        <thead className="sticky top-0 z-10 bg-ink-600">
          <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-fog-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`whitespace-nowrap px-5 py-3 font-semibold ${right.includes(i) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-ink-600">{children}</tbody>
      </table>
    </div>
  );
}
export const td = "px-5 py-3.5 align-middle";
export const tdNum = "px-5 py-3.5 text-right tabular-nums";

export function EmptyState({ icon = "check", title, children }: { icon?: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-ink-500 text-fog ring-1 ring-inset ring-line">
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
    <nav aria-label="Date range" className="inline-flex rounded-xl border border-line bg-ink-700 p-1 shadow-card">
      {RANGE_PRESETS.map((r) => (
        <Link
          key={r.key}
          href={href(r.key)}
          aria-current={current === r.key ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${current === r.key ? "bg-ink-500 text-white shadow-card ring-1 ring-inset ring-line" : "text-fog hover:text-white"}`}
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
    <nav aria-label="Views" className="flex gap-1 overflow-x-auto border-b border-line px-3 [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={`relative shrink-0 whitespace-nowrap px-3 py-3.5 text-sm font-semibold transition-colors ${current === t.key ? "text-white" : "text-fog hover:text-white"}`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] tabular-nums ${current === t.key ? "bg-lime/15 text-lime" : "bg-ink-500 text-fog"}`}>{t.count}</span>
          )}
          {current === t.key && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-lime" />}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ path, page, pages, params = {} }: { path: string; page: number; pages: number; params?: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${path}?${new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter((e): e is [string, string] => !!e[1]))}`;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
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

/** Bet-Prime-style KPI card: coloured icon, optional badge, big number and uppercase label. */
export function KpiCard({ icon, iconBg, badge, value, label }: { icon: React.ReactNode; iconBg: string; badge?: string; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-700 p-5 shadow-card">
      <div className="flex items-start justify-between">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconBg}`}>{icon}</span>
        {badge && <span className="rounded-md bg-ink-600 px-2.5 py-1 text-[11px] font-semibold text-fog">{badge}</span>}
      </div>
      <div className="mt-4 font-display text-[28px] font-bold leading-none tracking-tight tabular-nums text-white">{value}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fog">{label}</div>
    </div>
  );
}

/** Quick-link card matching the Bet Prime dashboard bottom row. */
export function QuickLink({ href, icon, iconBg, title, desc }: { href: string; icon: IconName; iconBg: string; title: string; desc: string }) {
  return (
    <a href={href} className="flex items-center gap-4 rounded-2xl border border-line bg-ink-700 p-5 shadow-card transition-colors hover:bg-ink-600">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconBg}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-white">{title}</div>
        <div className="mt-0.5 truncate text-sm text-fog">{desc}</div>
      </div>
      <Icon name="chevron" className="h-5 w-5 shrink-0 text-fog" />
    </a>
  );
}

export const field =
  "h-10 rounded-xl border border-line bg-ink-700 px-3.5 text-sm text-white shadow-card placeholder:text-fog-muted focus:border-lime/60 focus:outline-none focus:ring-4 focus:ring-lime/15";
export const btnGhost =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-ink-700 px-3.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-ink-500";
export const btnPrimary =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-lime px-4 text-sm font-semibold text-lime-ink shadow-[0_8px_20px_-8px_rgb(var(--lime)/0.6)] transition-colors hover:bg-lime-600 disabled:opacity-50";
