/** Runs once when the web server starts (Next.js instrumentation hook). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcilePendingDeposits } = await import("./lib/wallet");
  // A deposit whose webhook was lost or arrived early is credited within seconds, even after the player leaves the page.
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    reconcilePendingDeposits(undefined, 30 * 60_000)
      .catch((e) => console.error("[wallet] background deposit check failed:", e instanceof Error ? e.message : e))
      .finally(() => (running = false));
  }, 15_000).unref();
}
