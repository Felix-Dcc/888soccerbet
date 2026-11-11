/** Ghana's flag. Shared by the header chip, the footer brand and the booking slip. */
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

/** Nigeria's flag: green, white, green. */
export function NigeriaFlag({ className = "h-3 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 6" className={`${className} shrink-0 rounded-[2px]`} aria-hidden>
      <rect width="3" height="6" x="0" fill="#008751" />
      <rect width="3" height="6" x="3" fill="#FFFFFF" />
      <rect width="3" height="6" x="6" fill="#008751" />
    </svg>
  );
}

/** The player's market: Nigeria's flag and name for Nigerian players, Ghana's for everyone else. */
export function MarketFlag({ nigeria, className }: { nigeria: boolean; className?: string }) {
  return nigeria ? <NigeriaFlag className={className} /> : <GhanaFlag className={className} />;
}
