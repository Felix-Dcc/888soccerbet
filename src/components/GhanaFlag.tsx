/** Ghana's flag — the market 888SoccerBet serves. Shared by the header chip and the footer brand. */
export function GhanaFlag({ className = "h-3 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 6" className={`${className} shrink-0 rounded-[2px]`} aria-hidden>
      <rect width="9" height="2" y="0" fill="#CE1126" />
      <rect width="9" height="2" y="2" fill="#FCD116" />
      <rect width="9" height="2" y="4" fill="#006B3F" />
      <path d="M4.5 2.35 4.85 3.4h1.1l-.89.65.34 1.05-.9-.65-.9.65.34-1.05-.89-.65h1.1z" fill="#000" />
    </svg>
  );
}
