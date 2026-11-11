/** Runs once when the web server starts (Next.js instrumentation hook). Node-only work lives in its own file so the edge build never bundles it. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
