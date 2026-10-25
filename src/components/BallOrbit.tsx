/**
 * A ball spinning inside two glowing orbit trails, for empty states. Original SVG; the
 * trails are short dashes running round dashed ellipses (no images, nothing to load).
 */
export function BallOrbit({ sport = "football", className = "h-20 w-20" }: { sport?: string; className?: string }) {
  const basketball = sport === "basketball";
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <radialGradient id={`kb-ball-${sport}`} cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor={basketball ? "#FFB061" : "#FFFFFF"} />
          <stop offset="1" stopColor={basketball ? "#D2601A" : "#C9D1DC"} />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="60" rx="54" ry="18" fill="none" stroke="rgb(var(--lime) / .18)" strokeWidth="1.5" transform="rotate(-20 60 60)" />
      <ellipse className="kb-orbit" pathLength={178} cx="60" cy="60" rx="54" ry="18" fill="none" stroke="rgb(var(--lime))" strokeWidth="2.5" strokeLinecap="round" transform="rotate(-20 60 60)" />
      <ellipse cx="60" cy="60" rx="50" ry="14" fill="none" stroke="rgb(245 196 81 / .18)" strokeWidth="1.5" transform="rotate(25 60 60)" />
      <ellipse className="kb-orbit kb-orbit-2" pathLength={178} cx="60" cy="60" rx="50" ry="14" fill="none" stroke="#F5C451" strokeWidth="2" strokeLinecap="round" transform="rotate(25 60 60)" />
      <g className="kb-ball">
        <circle cx="60" cy="60" r="24" fill={`url(#kb-ball-${sport})`} stroke={basketball ? "#8A3A0A" : "#55606F"} strokeWidth="1.2" />
        {basketball ? (
          <g fill="none" stroke="#5A2507" strokeWidth="1.6" strokeLinecap="round">
            <path d="M36 60h48M60 36v48" />
            <path d="M43 43c7 9 7 25 0 34M77 43c-7 9-7 25 0 34" />
          </g>
        ) : (
          <g fill="#1B222C">
            <path d="m60 49 8.5 6.2-3.2 10H54.7l-3.2-10z" />
            <path d="M60 36.5 66 41l-6 4.6-6-4.6zM80.5 52.7l-1.6 7.3-7.1-2.2 1.2-7.4zM73.4 78.4l-7.2 1.5-.7-7.4 7.1-2zM46.6 78.4l7.2 1.5.7-7.4-7.1-2zM39.5 52.7l1.6 7.3 7.1-2.2-1.2-7.4z" opacity=".85" />
          </g>
        )}
      </g>
    </svg>
  );
}
