/** Shared pieces of the bet-history views. */

export function Trophy({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 3h10v2h3a1 1 0 0 1 1 1v1.5A4.5 4.5 0 0 1 17.2 12a5.5 5.5 0 0 1-4.2 3.4V18h3a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1h3v-2.6A5.5 5.5 0 0 1 6.8 12 4.5 4.5 0 0 1 3 7.5V6a1 1 0 0 1 1-1h3zm10 4v2.9A2.5 2.5 0 0 0 19 7.5V7zM5 7v.5a2.5 2.5 0 0 0 2 2.4V7z" />
    </svg>
  );
}
