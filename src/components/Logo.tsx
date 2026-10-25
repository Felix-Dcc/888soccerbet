import { useId } from "react";

/**
 * Kingz Bet crown mark: a gold three-point crown with jewelled tips (centre jewel in the
 * brand lime) on a dark tile with a fine gold edge. Original brand asset; the same drawing
 * is used for the favicon (src/app/icon.svg).
 */
export function CrownMark({ size = 30, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1C2533" />
          <stop offset="1" stopColor="#0B0F14" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE7A3" />
          <stop offset=".5" stopColor="#F5C451" />
          <stop offset="1" stopColor="#C98A1B" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}t)`} />
      <rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="none" stroke="#F5C451" strokeOpacity=".45" />
      {/* crown body and band */}
      <path d="M7.5 21.2 6 11.2l5.6 4.3L16 7.8l4.4 7.7 5.6-4.3-1.5 10Z" fill={`url(#${id}g)`} />
      <rect x="7.5" y="22.2" width="17" height="3" rx="1.2" fill={`url(#${id}g)`} />
      {/* facet highlight */}
      <path d="M16 7.8 11.6 15.5 7.5 12.4" fill="none" stroke="#FFF4CF" strokeOpacity=".55" strokeWidth=".7" strokeLinejoin="round" />
      {/* jewels */}
      <circle cx="6" cy="10.6" r="1.5" fill={`url(#${id}g)`} />
      <circle cx="26" cy="10.6" r="1.5" fill={`url(#${id}g)`} />
      <circle cx="16" cy="6.9" r="1.8" fill="#C6F24E" />
      <circle cx="12" cy="23.7" r=".75" fill="#0B0F14" />
      <circle cx="16" cy="23.7" r=".95" fill="#C6F24E" />
      <circle cx="20" cy="23.7" r=".75" fill="#0B0F14" />
    </svg>
  );
}

/**
 * "Kingz Bet" wordmark with a small gold crown sitting on the "z". The crown is sized in em,
 * so it scales with whatever font size the wordmark is set in.
 */
export function Wordmark() {
  return (
    <span className="whitespace-nowrap">
      King
      <span className="relative inline-block">
        z
        <svg viewBox="0 0 24 16" aria-hidden className="pointer-events-none absolute -top-[0.34em] left-1/2 h-[0.42em] w-[0.6em] -translate-x-1/2 drop-shadow-[0_1px_1px_rgba(0,0,0,.35)]">
          <path d="M2 14 1 4l6 4.5L12 1l5 7.5L23 4l-1 10Z" fill="#F5C451" stroke="#B9831A" strokeWidth="1" strokeLinejoin="round" />
          <circle cx="12" cy="1.8" r="1.6" fill="#FFE7A3" />
        </svg>
      </span>
      <span className="text-lime"> Bet</span>
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-extrabold tracking-tight ${className}`}>
      <CrownMark />
      <span className="text-[1.15rem] leading-none text-white">
        <Wordmark />
      </span>
    </span>
  );
}
