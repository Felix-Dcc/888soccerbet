"use client";
import { useState } from "react";
import Link from "next/link";

export interface FeedItem {
  at: string; // ISO
  kind: "registration" | "bet" | "payment" | "admin";
  text: string;
  href?: string;
}

const KINDS = [
  { key: "all", label: "All" },
  { key: "registration", label: "Sign-ups" },
  { key: "bet", label: "Bets" },
  { key: "payment", label: "Payments" },
  { key: "admin", label: "Admin" },
] as const;
const DOT = { registration: "bg-lime", bet: "bg-[#3B82F6]", payment: "bg-gold", admin: "bg-fog" } as const;
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Latest events as a timeline, filterable by type (the events themselves come from the server). */
export function ActivityFeed({ items }: { items: FeedItem[] }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("all");
  const shown = kind === "all" ? items : items.filter((i) => i.kind === kind);
  const kinds = KINDS.filter((k) => k.key === "all" || items.some((i) => i.kind === k.key));
  return (
    <div>
      <div role="tablist" aria-label="Event type" className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-3 py-2 [scrollbar-width:none]">
        {kinds.map((k) => (
          <button
            key={k.key}
            role="tab"
            type="button"
            aria-selected={kind === k.key}
            onClick={() => setKind(k.key)}
            className={`shrink-0 rounded px-2.5 py-1 text-xs font-semibold ${kind === k.key ? "bg-white/[0.09] text-white" : "text-fog hover:text-white"}`}
          >
            {k.label}
            <span className="ml-1 tabular-nums opacity-60">{k.key === "all" ? items.length : items.filter((i) => i.kind === k.key).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fog">Nothing in this view.</p>
      ) : (
        <ol className="relative px-4 py-3">
          <span className="absolute bottom-3 left-[1.3rem] top-3 w-px bg-white/[0.07]" aria-hidden />
          {shown.map((a, i) => (
            <li key={i} className="relative flex items-start gap-3 py-1.5 text-[13px]">
              <span className={`relative mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ring-[#10151C] ${DOT[a.kind]}`} aria-hidden />
              <span className="min-w-0 flex-1 leading-snug">
                {a.href ? (
                  <Link href={a.href} className="text-white hover:text-lime">
                    {a.text}
                  </Link>
                ) : (
                  <span className="text-white">{a.text}</span>
                )}
              </span>
              <time dateTime={a.at} className="shrink-0 tabular-nums text-xs text-fog">
                {time(a.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
