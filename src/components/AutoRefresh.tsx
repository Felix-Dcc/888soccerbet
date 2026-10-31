"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the page's server data on a fixed cadence, so a panel that promises "refresh every
 * N minutes" actually does. Skips hidden tabs and catches up when the tab comes back, so a
 * background tab costs nothing.
 */
export function AutoRefresh({ minutes }: { minutes: number }) {
  const router = useRouter();
  useEffect(() => {
    const everyMs = minutes * 60_000;
    let due = Date.now() + everyMs;
    const tick = () => {
      if (document.visibilityState !== "visible" || Date.now() < due) return;
      due = Date.now() + everyMs;
      router.refresh();
    };
    const t = setInterval(tick, 30_000); // coarse timer; `due` keeps the real cadence
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [minutes, router]);
  return null;
}
