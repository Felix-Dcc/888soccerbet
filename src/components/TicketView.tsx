import Link from "next/link";
import { formatMilliOdds, formatPesewas } from "@/lib/money";
import { formatStamp } from "@/lib/time";
import { legOutcome, ticketTotals, type Ticket } from "@/lib/tickets";
import { Trophy } from "./BetTicket";
import { ShareTicket } from "./ShareTicket";
import { CashoutPanel, type CashoutQuote } from "./CashoutPanel";
import { LivePill } from "./MatchTable";

const legTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: process.env.NEXT_PUBLIC_TIMEZONE || "Africa/Accra",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// Win green for indicators; the brand lime stays on buttons.
const WIN = "text-teal";
const STATUS: Record<string, { label: string; tone: string }> = {
  WON: { label: "Won", tone: WIN },
  LOST: { label: "Lost", tone: "text-danger" },
  VOID: { label: "Void", tone: "text-fog" },
  REJECTED: { label: "Rejected", tone: "text-fog" },
  PENDING: { label: "Running", tone: "text-gold" },
};

export type CashoutProps = { quote: CashoutQuote; auto: { target: string; above: boolean } | null; partialsLeft: number };

/** Running bets get the light "running" slip; settled ones the dark result ticket with its verify code. */
export function TicketView({ bet, verifyCode, owner, cashout }: { bet: Ticket; verifyCode?: string; owner: boolean; cashout?: CashoutProps }) {
  if (bet.status === "PENDING") return <RunningTicket bet={bet} cashout={owner ? cashout : undefined} />;
  return <SettledTicket bet={bet} verifyCode={verifyCode!} owner={owner} />;
}

/**
 * Settled ticket, dark charcoal: summary (ID, time, result, return, stake, odds), the verification
 * code, then every selection with its score, pick@odds, market and outcome. Everything comes from
 * the bet record. `owner` adds the Share/Verify actions; the public page shows the same ticket
 * without them, and never anything about who placed it.
 */
function SettledTicket({ bet, verifyCode, owner }: { bet: Ticket; verifyCode: string; owner: boolean }) {
  const status = STATUS[bet.status] ?? STATUS.PENDING!;
  const won = bet.status === "WON";
  const { cashed, placedStake, ret } = ticketTotals(bet);
  const amount = formatPesewas(ret ?? bet.potentialPayout);

  return (
    <article aria-label={`Ticket ${bet.ref}`} className="overflow-hidden rounded-2xl bg-ink-700 text-white shadow-lift ring-1 ring-line">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-fog-muted">
          <span>Ticket ID: {bet.ref}</span>
          <span>{formatStamp(bet.placedAt)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{bet.type === "ACCUMULATOR" ? "Multiple" : "Single"}</h2>
          <span className={`flex items-center gap-1.5 font-display text-lg font-bold ${status.tone}`}>
            {won && bet.cashouts.some((c) => c.full) && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold">Cashed out</span>
            )}
            {won && <Trophy className="h-6 w-6" />}
            {status.label}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-sm text-fog">Total Bet Zone Return</span>
          <span className={`whitespace-nowrap font-display text-[28px] font-extrabold leading-tight tabular-nums ${won ? WIN : "text-white"}`}>
            <span className="mr-1 text-sm font-bold opacity-70">GHS</span>
            {amount}
          </span>
        </div>

        <dl className="mt-4 space-y-2 border-t border-white/[0.08] pt-4 text-[15px]">
          <Row label="Total Stake" value={formatPesewas(placedStake)} />
          <Row label="Total Odds" value={formatMilliOdds(bet.combinedMilliOdds)} />
          {cashed > 0n && <Row label="Cashed out" value={formatPesewas(cashed)} />}
          {bet.bonusAmount > 0n && <Row label="Total Bonus" value={formatPesewas(bet.bonusAmount)} />}
        </dl>

        {bet.cashouts.length > 0 && (
          <ul aria-label="Cash outs" className="mt-3 space-y-1 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-fog">
            {bet.cashouts.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 tabular-nums">
                <span>
                  {formatStamp(c.createdAt)} · {c.full ? "Full" : "Partial"}
                  {c.auto ? " (auto)" : ""}
                </span>
                <span className="font-semibold text-white">GHS {formatPesewas(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        {owner && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <ShareTicket code={verifyCode} won={won} amount={amount} />
            <Link href={`/verify/${verifyCode}`} className="btn h-12 border border-white/15 bg-white/[0.06] text-[15px] text-white hover:bg-white/[0.1]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6l-8-3Z" />
                <path d="m8.5 12 2.5 2.5 4.5-5" />
              </svg>
              Verify
            </Link>
          </div>
        )}
      </div>

      <div className="border-y border-white/[0.06] bg-white/[0.04] px-4 py-3 text-center text-sm">
        <span className="text-fog">Verify Code: </span>
        <span className={`select-all break-all font-mono font-bold tracking-wider ${WIN}`}>{verifyCode}</span>
      </div>

      <ol aria-label="Selections" className="divide-y divide-white/[0.06]">
        {bet.selections.map((leg) => {
          const f = leg.fixture;
          const legWon = leg.status === "WON";
          const hasScore = f.homeScore !== null && f.awayScore !== null;
          const score =
            f.status === "CANCELLED" ? ["Match", "Void"] : hasScore ? [f.status === "FINISHED" ? "FT Score" : "Live", `${f.homeScore}:${f.awayScore}`] : null;
          return (
            <li key={leg.id} className="grid grid-cols-[2.25rem_1fr] items-center gap-x-2 px-3 py-4 sm:grid-cols-[3rem_1fr] sm:px-5">
              <LegMark status={leg.status} />
              <div className="min-w-0">
                <div className="text-xs tabular-nums text-fog-muted">| {legTime.format(f.startsAt)}</div>
                <div className="mt-1 font-semibold leading-snug">
                  {f.homeTeam} <span className="font-normal text-fog-muted">v</span> {f.awayTeam}
                </div>
                <Link href={`/fixture/${f.id}`} className={`mt-1 inline-flex items-center gap-1.5 text-sm font-semibold ${WIN} hover:underline`}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 3v18h18" />
                    <path d="m7 15 4-4 3 3 5-6" />
                  </svg>
                  Match details
                </Link>
                {score && (
                  <div className="mt-1 text-[15px]">
                    <span className="text-fog">{score[0]}</span> <span className="font-bold tabular-nums">{score[1]}</span>
                  </div>
                )}
                <dl className="relative mt-3 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 overflow-hidden rounded-md bg-white/[0.06] px-3 py-3 text-[15px]">
                  {legWon && <Trophy className="pointer-events-none absolute right-3 top-1/2 h-14 w-14 -translate-y-1/2 text-teal/15" />}
                  <dt className="text-right text-fog">Pick</dt>
                  <dd className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <span className="min-w-0">
                      {leg.selectionName}@{formatMilliOdds(leg.milliOddsAtPlacement)}
                    </span>
                    {legWon && (
                      <span className={WIN} aria-label="won">
                        ✓
                      </span>
                    )}
                    {leg.status === "LOST" && (
                      <span className="text-danger" aria-label="lost">
                        ✕
                      </span>
                    )}
                  </dd>
                  <dt className="text-right text-fog">Market</dt>
                  <dd className="min-w-0">{leg.marketName}</dd>
                  <dt className="text-right text-fog">Outcome</dt>
                  <dd className="min-w-0">{leg.status === "OPEN" ? <span className="text-fog-muted">Not settled yet</span> : legOutcome(leg)}</dd>
                </dl>
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fog">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Round mark beside each selection: ✓ won, ✕ lost, – void, empty ring while running. */
function LegMark({ status }: { status: string }) {
  const base = "grid h-7 w-7 place-items-center rounded-full text-sm font-bold";
  if (status === "WON")
    return (
      <span className={`${base} bg-teal text-lime-ink`} aria-label="Won">
        ✓
      </span>
    );
  if (status === "LOST")
    return (
      <span className={`${base} bg-danger text-snow`} aria-label="Lost">
        ✕
      </span>
    );
  if (status === "VOID")
    return (
      <span className={`${base} bg-white/15 text-white`} aria-label="Void">
        –
      </span>
    );
  return <span className={`${base} border-2 border-white/25`} aria-label="Running" />;
}

/**
 * Running (unsettled) slip, deliberately unlike the result ticket: light card, potential win,
 * progress through the selections, each one's live state, and cash out at the bottom (the same
 * button as on My Bets). No verify code or sharing until it is settled.
 */
function RunningTicket({ bet, cashout }: { bet: Ticket; cashout?: CashoutProps }) {
  const { cashed, placedStake } = ticketTotals(bet);
  const total = bet.selections.length;
  const done = bet.selections.filter((l) => l.status !== "OPEN").length;
  const now = Date.now();

  return (
    <article aria-label={`Ticket ${bet.ref}, running`} className="card overflow-hidden">
      <div className="border-b border-line bg-[linear-gradient(135deg,rgb(var(--lime)/0.09),transparent_65%)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-fog-muted">
          <span>Ticket ID: {bet.ref}</span>
          <span>{formatStamp(bet.placedAt)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-white">{bet.type === "ACCUMULATOR" ? "Multiple" : "Single"}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-gold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" aria-hidden />
            Running
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-sm text-fog">Potential Win</span>
          <span className="whitespace-nowrap font-display text-[26px] font-extrabold leading-tight tabular-nums text-white">
            <span className="mr-1 text-sm font-bold text-fog">GHS</span>
            {formatPesewas(bet.potentialPayout)}
          </span>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-right text-xs tabular-nums text-fog">
            {done}/{total} settled
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-ink-500"
            role="progressbar"
            aria-label="Selections settled"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <div className="h-full rounded-full bg-lime transition-[width] duration-700" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Total Stake" value={formatPesewas(placedStake)} />
          <Stat label="Total Odds" value={formatMilliOdds(bet.combinedMilliOdds)} />
          {cashed > 0n && <Stat label="Stake still running" value={formatPesewas(bet.stake)} />}
          {cashed > 0n && <Stat label="Cashed out so far" value={formatPesewas(cashed)} />}
        </dl>
      </div>

      <ol aria-label="Selections" className="divide-y divide-line">
        {bet.selections.map((leg) => {
          const f = leg.fixture;
          const started = f.startsAt.getTime() <= now;
          const over = f.status === "FINISHED" || f.status === "CANCELLED";
          const live = started && !over && leg.status === "OPEN";
          const hasScore = f.homeScore !== null && f.awayScore !== null;
          return (
            <li key={leg.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
              <span className="mt-0.5 shrink-0">
                <RunningMark status={leg.status} live={live} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs tabular-nums">
                  {live ? (
                    <LivePill startsAt={f.startsAt} sportKey={f.sportKey} />
                  ) : leg.status === "OPEN" && over ? (
                    <span className="font-semibold text-fog">Awaiting result</span>
                  ) : (
                    <span className="text-fog-muted">{legTime.format(f.startsAt)}</span>
                  )}
                  {hasScore && (
                    <span className="font-bold text-white">
                      {f.homeScore}:{f.awayScore}
                    </span>
                  )}
                </div>
                <Link href={`/fixture/${f.id}`} className="mt-0.5 block font-semibold leading-snug text-white hover:text-lime">
                  {f.homeTeam} <span className="font-normal text-fog-muted">v</span> {f.awayTeam}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="rounded-md bg-ink-600 px-2 py-0.5 font-semibold text-white">
                    {leg.selectionName} <span className="tabular-nums text-gold">@{formatMilliOdds(leg.milliOddsAtPlacement)}</span>
                  </span>
                  <span className="text-fog">{leg.marketName}</span>
                </div>
                {leg.status !== "OPEN" && <div className="mt-1 text-xs text-fog">Outcome: {legOutcome(leg)}</div>}
              </div>
            </li>
          );
        })}
      </ol>

      {bet.cashouts.length > 0 && (
        <ul aria-label="Cash outs" className="space-y-1 border-t border-line bg-ink-600/50 px-4 py-2.5 text-xs text-fog sm:px-5">
          {bet.cashouts.map((c) => (
            <li key={c.id} className="flex justify-between gap-3 tabular-nums">
              <span>
                {formatStamp(c.createdAt)} · Partial cash out{c.auto ? " (auto)" : ""}
              </span>
              <span className="font-semibold text-white">GHS {formatPesewas(c.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {cashout && (
        <div className="border-t border-line p-4 sm:px-5">
          <CashoutPanel betRef={bet.ref} quote={cashout.quote} auto={cashout.auto} partialsLeft={cashout.partialsLeft} options />
        </div>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-600/70 px-3 py-2">
      <dt className="text-xs text-fog">{label}</dt>
      <dd className="font-bold tabular-nums text-white">{value}</dd>
    </div>
  );
}

/** Running-slip marks: ✓ won, ✕ lost, – void, pulsing red while in play, open ring before kick-off. */
function RunningMark({ status, live }: { status: string; live: boolean }) {
  const base = "grid h-6 w-6 place-items-center rounded-full text-xs font-bold";
  if (status === "WON")
    return (
      <span className={`${base} bg-teal text-lime-ink`} aria-label="Won">
        ✓
      </span>
    );
  if (status === "LOST")
    return (
      <span className={`${base} bg-danger text-white`} aria-label="Lost">
        ✕
      </span>
    );
  if (status === "VOID")
    return (
      <span className={`${base} bg-ink-400 text-white`} aria-label="Void">
        –
      </span>
    );
  if (live)
    return (
      <span className={`${base} border-2 border-danger`} aria-label="In play">
        <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
      </span>
    );
  return <span className={`${base} border-2 border-ink-400`} aria-label="Not started" />;
}
