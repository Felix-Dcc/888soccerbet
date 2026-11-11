"use client";
import { useEffect, useState } from "react";
import { liveClockLabel, liveHalf } from "@/lib/liveClock";

/** A live pick's match clock, half and score, e.g. "66' H2 | 2:0" or "HT | 1:0". Ticks on its own. */
export function LegClock({ startsAt, sportKey, home, away }: { startsAt: string; sportKey: string; home: number | null; away: number | null }) {
  const [now, setNow] = useState(0); // 0 until mounted: server and first client render agree (no hydration mismatch)
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const label = now ? liveClockLabel(sportKey, new Date(startsAt).getTime(), now) : null;
  const half = label ? liveHalf(sportKey, label) : null;
  return (
    <span className="text-sm font-bold text-lime">
      {label ? `${label}${half ? ` ${half}` : ""}` : "Live"} | {home ?? 0}:{away ?? 0}
    </span>
  );
}
