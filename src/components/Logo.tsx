import { TrendingUp } from "lucide-react";

/*
 * The Bet Zone logo, as on the Bet Zone site (betzone-henna.vercel.app): a green tile with a
 * rising-trend arrow beside the name and a SPORTSBOOK tag. Built from theme tokens, so the name
 * reads on white and on the dark blocks alike; the tile is the brand green in both.
 */

const SIZES = {
  sm: { tile: "size-8 rounded-lg", icon: "size-4", name: "text-base", tag: "text-[8px]" },
  md: { tile: "size-9 rounded-xl sm:size-10", icon: "size-5 sm:size-6", name: "text-lg sm:text-xl", tag: "text-[9px] sm:text-[9.5px]" },
  lg: { tile: "size-12 rounded-2xl", icon: "size-7", name: "text-2xl", tag: "text-[11px]" },
} as const;

/** The tile on its own — for places with room for a square mark only (collapsed admin rail, toasts). */
export function BrandMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-lime to-lime/80 text-lime-ink shadow-md shadow-lime/25 ${className}`}
      style={{ width: size, height: size }}
    >
      <TrendingUp strokeWidth={2} style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}

export function Logo({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex min-w-0 items-center gap-2.5 ${className}`} role="img" aria-label="Bet Zone">
      <span aria-hidden className={`grid shrink-0 place-items-center bg-gradient-to-br from-lime to-lime/80 text-lime-ink shadow-md shadow-lime/25 ${s.tile}`}>
        <TrendingUp strokeWidth={2} className={s.icon} />
      </span>
      <span aria-hidden className="flex flex-col">
        {/* Wordmark: heavy, wide italic caps (pr keeps the slanted last letter from being clipped). */}
        <span className={`truncate pr-1 font-brand font-black uppercase italic leading-none tracking-tight ${s.name}`}>
          <span className="text-white">Bet</span>
          <span className="bg-gradient-to-b from-lime to-lime-600 bg-clip-text text-transparent">Zone</span>
        </span>
        <span className={`mt-0.5 font-brand font-extrabold uppercase italic leading-tight tracking-widest text-lime ${s.tag}`}>Sportsbook</span>
      </span>
    </span>
  );
}
