"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMilliOdds } from "@/lib/money";
import { moneyIn } from "@/lib/currency";
import { useCurrency } from "./CurrencyContext";
import { DATA_CHANGED_EVENT } from "./LiveRefresh";

interface ApiSelection {
  status: string;
  fixtureName: string;
  selectionName: string;
  fixture: { startsAt: string; status: string; homeScore: number | null; awayScore: number | null } | null;
}
interface ApiBet {
  id: string;
  ref: string;
  type: string;
  stake: string; // pesewas, serialised from BigInt
  combinedMilliOdds: number;
  potentialPayout: string;
  status: string;
  selections: ApiSelection[];
}
type Feed = { bets: ApiBet[]; cashoutable: string[] };
type Filter = "unsettled" | "cashout" | "live";

/**
 * "My bets" side of the rail: the player's open bets, split the way a book splits them —
 * everything unsettled, the ones that can be cashed out, and the ones already in play.
 * Counts are real; settled bets live on the full My bets page.
 */
export function MyBets() {
  const currency = useCurrency();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [filter, setFilter] = useState<Filter>("unsettled");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/bets", { cache: "no-store" });
      if (!r.ok) {
        setSignedOut(r.status === 401);
        setFeed({ bets: [], cashoutable: [] });
        return;
      }
      setSignedOut(false);
      setFeed((await r.json()) as Feed);
    } catch {
      setFeed({ bets: [], cashoutable: [] }); // offline: show the empty state, not a crash
    }
  }, []);

  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener("sb:refresh", h); // a bet was just placed, or the balance moved
    window.addEventListener(DATA_CHANGED_EVENT, h); // prices/scores changed on the server
    return () => {
      window.removeEventListener("sb:refresh", h);
      window.removeEventListener(DATA_CHANGED_EVENT, h);
    };
  }, [load]);

  const bets = feed?.bets ?? [];
  const pending = bets.filter((b) => b.status === "PENDING");
  const now = Date.now();
  const live = pending.filter((b) => b.selections.some((s) => s.fixture && new Date(s.fixture.startsAt).getTime() <= now));
  const cashout = pending.filter((b) => feed?.cashoutable.includes(b.id));

  const tabs: { key: Filter; label: string; rows: ApiBet[] }[] = [
    { key: "unsettled", label: "All Unsettled", rows: pending },
    { key: "cashout", label: "Cashout", rows: cashout },
    { key: "live", label: "Live", rows: live },
  ];
  const shown = tabs.find((t) => t.key === filter)?.rows ?? pending;
  const emptyText =
    filter === "cashout" ? "No bets available for cash out." : filter === "live" ? "You currently have no bets in play." : "You currently have no unsettled bets.";

  return (
    <div>
      {/* One line in a 300px rail: superscript counts and a compact pill, with scroll as a backstop. */}
      <div className="flex items-center gap-2.5 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            aria-current={filter === t.key ? "true" : undefined}
            className={`relative shrink-0 whitespace-nowrap py-1 text-[12px] font-semibold transition-colors ${
              filter === t.key ? "text-lime" : "text-white hover:text-lime"
            }`}
          >
            {t.label}
            <sup className="ml-0.5 text-[9px] font-bold tabular-nums text-fog-muted">{t.rows.length}</sup>
            {filter === t.key && <span className="absolute inset-x-0 -bottom-2 h-0.5 rounded-full bg-lime" />}
          </button>
        ))}
        <Link
          href="/bets?tab=settled"
          className="ml-auto shrink-0 rounded-full border border-lime px-2 py-0.5 text-[10px] font-semibold text-lime transition-colors hover:bg-lime/10"
        >
          Settled ›
        </Link>
      </div>

      {feed === null ? (
        <div className="space-y-2 p-3">
          <div className="skeleton h-12" />
          <div className="skeleton h-12" />
        </div>
      ) : signedOut ? (
        <Empty text="Log in to see your bets.">
          <Link href="/login" className="btn-lime mt-3 px-4 py-2 text-sm">
            Log in
          </Link>
        </Empty>
      ) : shown.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <ul>
          {shown.map((b) => (
            <li key={b.id} className="border-b border-line last:border-0">
              <Link href={`/bets/${b.ref}`} className="block px-3 py-2.5 transition-colors hover:bg-ink-600/50">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-white">
                    {b.selections.length > 1 ? `Multiple · ${b.selections.length} legs` : (b.selections[0]?.fixtureName ?? b.ref)}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-gold">{formatMilliOdds(b.combinedMilliOdds)}</span>
                </div>
                {b.selections.filter((s) => inPlay(s, now)).map((s, i) => (
                  <div key={i} className="mt-1 flex items-center gap-2 text-[11px]">
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-fog">{s.fixtureName}</span>
                    <span className="shrink-0 font-extrabold tabular-nums text-lime">
                      {s.fixture!.homeScore ?? 0} : {s.fixture!.awayScore ?? 0}
                    </span>
                  </div>
                ))}
                <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-fog-muted">
                  <span className="tabular-nums">Stake {moneyIn(currency, BigInt(b.stake))}</span>
                  <span className="tabular-nums">Returns {moneyIn(currency, BigInt(b.potentialPayout))}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A leg whose match has kicked off, isn't over, and has a score to show. */
const inPlay = (s: ApiSelection, now: number) =>
  !!s.fixture && new Date(s.fixture.startsAt).getTime() <= now && s.fixture.status !== "FINISHED" && s.fixture.status !== "CANCELLED" && (s.fixture.homeScore !== null || s.fixture.awayScore !== null);

function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <EmptyBox />
      <p className="mt-4 text-sm text-fog">{text}</p>
      {children}
    </div>
  );
}

/** Open, empty carton — the usual "nothing here yet" picture, drawn in the brand accent. */
function EmptyBox() {
  return (
    <svg viewBox="0 0 96 76" className="h-20 w-24" aria-hidden>
      <ellipse cx="48" cy="68" rx="30" ry="5" fill="rgb(var(--lime))" opacity=".12" />
      <path d="M18 34h60v30a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4Z" fill="rgb(var(--lime))" opacity=".55" />
      <path d="M48 34v34" stroke="rgb(var(--ink-900))" strokeWidth="1.5" opacity=".35" />
      <path d="M18 34 8 20l26-6 14 20Z" fill="rgb(var(--lime))" opacity=".85" />
      <path d="M78 34 88 20l-26-6-14 20Z" fill="rgb(var(--lime))" opacity=".7" />
      <circle cx="66" cy="54" r="12" fill="rgb(var(--ink-600))" stroke="rgb(var(--line))" strokeWidth="1.5" />
      <g fill="rgb(var(--fog))">
        <circle cx="61" cy="54" r="1.6" />
        <circle cx="66" cy="54" r="1.6" />
        <circle cx="71" cy="54" r="1.6" />
      </g>
    </svg>
  );
}
