import Link from "next/link";
import { BallOrbit } from "@/components/BallOrbit";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatPesewas } from "@/lib/money";
import { formatStamp } from "@/lib/time";
import { SignedOut } from "@/components/SignedOut";
import { PageHero } from "@/components/PageHero";
import { ResultBar } from "@/components/BetTicket";
import { photos } from "@/lib/photos";
import { ticketTotals } from "@/lib/tickets";
import { quotesFor, partialLimit } from "@/lib/cashout";
import { CashoutPanel } from "@/components/CashoutPanel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All" },
  { key: "settled", label: "Settled" },
  { key: "unsettled", label: "Unsettled" },
] as const;

/** Bet history as tickets: result bar (trophy on a win), matches, total stake and return. */
export default async function BetsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <SignedOut title="My bets" />;
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.key === raw)?.key ?? "all";

  const bets = await prisma.bet.findMany({
    where: { userId: user.id, ...(tab === "settled" ? { status: { not: "PENDING" } } : tab === "unsettled" ? { status: "PENDING" } : {}) },
    orderBy: { placedAt: "desc" },
    take: 50,
    include: { selections: { select: { fixtureName: true } }, cashouts: { select: { amount: true, stakePortion: true, full: true } } },
  });
  const quotes = await quotesFor(bets.filter((b) => b.status === "PENDING").map((b) => b.id));

  return (
    <div className="space-y-4">
      <PageHero title="My bets" photo={photos.footballBallSpotlight} position="center 70%" />

      <nav aria-label="Bet filter" className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "all" ? "/bets" : `/bets?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined} className={`chip ${t.key === tab ? "chip-active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {bets.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 p-10">
          <BallOrbit className="h-24 w-24" />
          <span className="font-semibold text-white">{tab === "all" ? "No bets yet" : `No ${tab} bets`}</span>
          <Link href="/" className="btn-ghost px-4 py-2 text-sm">
            Matches
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {bets.map((b) => {
            const matches = b.selections.map((s) => s.fixtureName);
            const { ret, placedStake } = ticketTotals(b);
            const q = quotes.get(b.id);
            return (
              <li key={b.id} className="card overflow-hidden transition hover:shadow-lift">
                <Link href={`/bets/${b.ref}`} className="block p-4">
                  <div className="mb-2 text-xs tabular-nums text-fog-muted">{formatStamp(b.placedAt)}</div>
                  <ResultBar type={b.type} status={b.status} chevron />
                  <div className="mt-3 flex gap-4">
                    <div className="min-w-0 flex-1 space-y-0.5 text-sm text-fog">
                      {matches.slice(0, 3).map((m, i) => (
                        <div key={i} className="truncate">
                          {m}
                        </div>
                      ))}
                      {matches.length > 3 && <div className="text-fog-muted">and {matches.length - 3} other {matches.length - 3 === 1 ? "match" : "matches"}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-fog-muted">Total Stake</div>
                      <div className="font-semibold tabular-nums text-white">{formatPesewas(placedStake)}</div>
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      <div className="text-xs text-fog-muted">{ret === null ? "Potential Win" : "Total Return"}</div>
                      <div className={`font-semibold tabular-nums ${b.status === "WON" ? "text-lime" : "text-white"}`}>{formatPesewas(ret ?? b.potentialPayout)}</div>
                    </div>
                  </div>
                </Link>
                {q && (
                  <div className="border-t border-line px-4 pb-4 pt-3">
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
