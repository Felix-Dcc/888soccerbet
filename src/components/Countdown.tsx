"use client";
import { useEffect, useState } from "react";

function left(ms: number) {
  if (ms <= 0) return "Started";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m % 60}m`;
  return `in ${m}m`;
}

/** "in 2h 14m", ticking each minute. Renders nothing until mounted to avoid hydration drift. */
export function Countdown({ to, className = "" }: { to: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  return <span className={className}>{left(new Date(to).getTime() - now)}</span>;
}
