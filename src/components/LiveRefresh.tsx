"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Fired when match data (scores, statuses, prices) changed on the server. */
export const DATA_CHANGED_EVENT = "kb:data-changed";

/**
 * Checks every few seconds whether match data changed and, only then, re-fetches the page's
 * server data, so a sync shows up within seconds. The check is one tiny DB-only request.
 */
export function LiveRefresh({ everyMs = 3_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return; // no polling from background tabs
      busy = true;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (r.ok) {
          const { v } = (await r.json()) as { v: string };
          if (last !== null && v !== last) {
            router.refresh();
            window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
          }
          last = v;
        }
      } catch {
        /* offline: try again next tick */
      } finally {
        busy = false;
      }
    };
    void check();
    const t = setInterval(check, everyMs);
    document.addEventListener("visibilitychange", check); // catch up as soon as the tab is back
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [everyMs, router]);
  return null;
}
