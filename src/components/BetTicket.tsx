/** Shared pieces of the bet-history views: the result bar with its trophy. */

export function Trophy({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 3h10v2h3a1 1 0 0 1 1 1v1.5A4.5 4.5 0 0 1 17.2 12a5.5 5.5 0 0 1-4.2 3.4V18h3a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1h3v-2.6A5.5 5.5 0 0 1 6.8 12 4.5 4.5 0 0 1 3 7.5V6a1 1 0 0 1 1-1h3zm10 4v2.9A2.5 2.5 0 0 0 19 7.5V7zM5 7v.5a2.5 2.5 0 0 0 2 2.4V7z" />
    </svg>
  );
}

const BAR: Record<string, string> = {
  WON: "bg-lime text-snow",
  LOST: "bg-[#9aa1ad] text-snow",
  VOID: "bg-[#9aa1ad] text-snow",
  REJECTED: "bg-[#9aa1ad] text-snow",
  PENDING: "bg-ink-900 text-white border border-line",
};
const LABEL: Record<string, string> = { WON: "Won", LOST: "Lost", VOID: "Void", REJECTED: "Rejected", PENDING: "Open" };

/** Coloured bar: bet type on the left, outcome on the right (a trophy marks a win). */
export function ResultBar({ type, status, chevron = false }: { type: string; status: string; chevron?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-sm px-2.5 py-1.5 text-sm font-bold ${BAR[status] ?? BAR.PENDING}`}>
      <span>{type === "ACCUMULATOR" ? "Multiple" : "Singles"}</span>
      <span className="flex items-center gap-1.5">
        {status === "WON" && <Trophy />}
        {LABEL[status] ?? status}
        {chevron && (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="m9 6 6 6-6 6" />
          </svg>
        )}
      </span>
    </div>
  );
}
