import Link from "next/link";
import { BallOrbit } from "@/components/BallOrbit";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatMilliOdds, formatPesewas } from "@/lib/money";
import { formatStamp } from "@/lib/time";
import { SignedOut } from "@/components/SignedOut";
import { Trophy } from "@/components/BetTicket";
import { ticketTotals } from "@/lib/tickets";
import { quotesFor, partialLimit } from "@/lib/cashout";
import { CashoutPanel } from "@/components/CashoutPanel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All" },
  { key: "unsettled", label: "Open" },
  { key: "settled", label: "Settled" },
] as const;

/** Outcome styling: the stripe down the ticket's edge and its status pill. Win is teal, loss red. */
type Tone = { stripe: string; pill: string; label: string };
const OPEN: Tone = { stripe: "bg-lime", pill: "bg-lime/15 text-lime", label: "Open" };
const TONE: Record<string, Tone> = {
  PENDING: OPEN,
  WON: { stripe: "bg-teal", pill: "bg-teal/15 text-teal", label: "Won" },
  LOST: { stripe: "bg-danger", pill: "bg-danger/15 text-danger", label: "Lost" },
  VOID: { stripe: "bg-fog-muted", pill: "bg-ink-500 text-fog", label: "Void" },
  REJECTED: { stripe: "bg-fog-muted", pill: "bg-ink-500 text-fog", label: "Rejected" },
};

/** Bet history as tickets: outcome, matches, odds, stake and return, with cash out on open bets. */
export default async function BetsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <SignedOut title="My bets" />;
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.key === raw)?.key ?? "all";

  const [bets, byStatus] = await Promise.all([
    prisma.bet.findMany({
      where: { userId: user.id, ...(tab === "settled" ? { status: { not: "PENDING" } } : tab === "unsettled" ? { status: "PENDING" } : {}) },
      orderBy: { placedAt: "desc" },
      take: 50,
      include: {
        selections: { select: { fixtureName: true, fixture: { select: { startsAt: true, status: true, homeScore: true, awayScore: true } } } },
        cashouts: { select: { amount: true, stakePortion: true, full: true } } },
    }),
    prisma.bet.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true }, _sum: { stake: true } }),
  ]);
  const quotes = await quotesFor(bets.filter((b) => b.status === "PENDING").map((b) => b.id));

  const open = byStatus.find((s) => s.status === "PENDING");
  const won = byStatus.find((s) => s.status === "WON")?._count._all ?? 0;
  const all = byStatus.reduce((n, s) => n + s._count._all, 0);
  const tabCount = { all, unsettled: open?._count._all ?? 0, settled: all - (open?._count._all ?? 0) };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="section-title text-2xl">My bets</h1>
        <Link href="/" className="text-sm font-semibold text-lime hover:underline">
          Place a bet →
        </Link>
      </div>

      {/* Record at a glance */}
      <div className="grid grid-cols-3 gap-3">
        <Summary label="Open bets" value={String(tabCount.unsettled)} sub={`GHS ${formatPesewas(open?._sum.stake ?? 0n)} staked`} />
        <Summary label="Won" value={String(won)} sub={tabCount.settled ? `of ${tabCount.settled} settled` : "None settled yet"} tone="text-teal" />
        <Summary label="All bets" value={String(all)} sub={all > 50 ? "Latest 50 listed below" : "Placed so far"} />
      </div>

      <nav aria-label="Bet filter" className="inline-flex rounded-lg border border-line bg-ink-600 p-0.5">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.key === "all" ? "/bets" : `/bets?tab=${t.key}`}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-ink-700 text-white shadow-card" : "text-fog hover:text-white"}`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-lime text-lime-ink" : "bg-ink-500 text-fog"}`}>{tabCount[t.key]}</span>
            </Link>
          );
        })}
      </nav>

      {bets.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 p-10 text-center">
          <BallOrbit className="h-24 w-24" />
          <div>
            <p className="font-semibold text-white">{tab === "all" ? "No bets yet" : tab === "unsettled" ? "No open bets" : "No settled bets"}</p>
            <p className="mt-1 text-sm text-fog-muted">Pick a price on any match to start a slip.</p>
          </div>
          <Link href="/" className="btn-lime px-5 py-2 text-sm">
            Browse matches
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {bets.map((b) => {
            const matches = b.selections.map((s) => s.fixtureName);
            const legs = b.selections.map((s) => ({ name: s.fixtureName, score: liveScore(s.fixture) }));
            const { ret, placedStake } = ticketTotals(b);
            const q = quotes.get(b.id);
            const cashedOut = b.status === "WON" && b.cashouts.some((c) => c.full); // a full cash out settles as WON
            const tone: Tone = cashedOut ? { stripe: "bg-teal", pill: "bg-teal/15 text-teal", label: "Cashed out" } : (TONE[b.status] ?? OPEN);
            return (
              <li key={b.id} className="card relative overflow-hidden transition hover:border-ink-400 hover:shadow-lift">
                <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tone.stripe}`} />
                <Link href={`/bets/${b.ref}`} className="group block py-4 pl-5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {b.type === "ACCUMULATOR" ? "Multiple" : "Single"}
                      <span className="font-medium text-fog-muted">
                        {" "}
                        · {matches.length} {matches.length === 1 ? "selection" : "selections"}
                      </span>
                    </span>
                    <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${tone.pill}`}>
                      {b.status === "WON" && <Trophy className="h-3.5 w-3.5" />}
                      {b.status === "PENDING" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" aria-hidden />}
                      {tone.label}
                    </span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-fog-muted transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </div>
                  <div className="mt-0.5 text-xs tabular-nums text-fog-muted">
                    {formatStamp(b.placedAt)} · {b.ref}
                  </div>

                  <ul className="mt-3 space-y-1 text-sm text-fog">
                    {legs.slice(0, 3).map((m, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className={`shrink-0 rounded-full ${m.score ? "h-1.5 w-1.5 animate-pulse bg-danger" : "h-1 w-1 bg-fog-muted"}`} aria-hidden />
                        <span className="min-w-0 truncate">{m.name}</span>
                        {m.score && (
                          <span className="ml-auto shrink-0 rounded bg-ink-600 px-1.5 text-xs font-extrabold tabular-nums text-lime" aria-label={`Live score ${m.score}`}>
                            {m.score}
                          </span>
                        )}
                      </li>
                    ))}
                    {matches.length > 3 && (
                      <li className="pl-3 text-fog-muted">
                        + {matches.length - 3} more {matches.length - 3 === 1 ? "match" : "matches"}
                      </li>
                    )}
                  </ul>

                  <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-ink-600 px-3 py-2.5">
                    <Figure label="Odds" value={formatMilliOdds(b.combinedMilliOdds)} tone="text-gold" />
                    <Figure label="Stake" value={formatPesewas(placedStake)} />
                    <Figure
                      label={ret === null ? "Potential win" : "Return"}
                      value={formatPesewas(ret ?? b.potentialPayout)}
                      tone={b.status === "WON" ? "text-teal" : ret === null ? "text-gold" : "text-white"}
                      end
                    />
                  </dl>
                </Link>
                {q && (
                  <div className="border-t border-line py-3 pl-5 pr-4">
                    <CashoutPanel
                      betRef={b.ref}
                      quote={q.available ? { available: true, offer: q.offer.toString() } : { available: false, reason: q.reason }}
                      auto={null}
                      partialsLeft={partialLimit(b.type) - b.cashouts.filter((c) => !c.full).length}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "2 : 1" for a match in play (kicked off, not over, scored), otherwise null. */
function liveScore(f: { startsAt: Date; status: string; homeScore: number | null; awayScore: number | null }): string | null {
  const inPlay = f.startsAt <= new Date() && f.status !== "FINISHED" && f.status !== "CANCELLED";
  return inPlay && (f.homeScore !== null || f.awayScore !== null) ? `${f.homeScore ?? 0} : ${f.awayScore ?? 0}` : null;
}

function Summary({ label, value, sub, tone = "text-white" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-fog-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-fog-muted">{sub}</div>
    </div>
  );
}

function Figure({ label, value, tone = "text-white", end = false }: { label: string; value: string; tone?: string; end?: boolean }) {
  return (
    <div className={end ? "text-right" : ""}>
      <dt className="text-[11px] text-fog-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
