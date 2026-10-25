/**
 * In-process fixed-window rate limiter. Adequate for a single-node MVP; a multi-node
 * deployment should swap this for a shared store (Redis). Documented as such.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (w.count >= limit) return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  w.count++;
  return { ok: true, retryAfter: 0 };
}

// Opportunistic cleanup so the map does not grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
}, 60_000).unref?.();

/**
 * The caller's IP for rate limits. The first X-Forwarded-For entry is whatever the client sent
 * (spoofable, so limits could be dodged); a reverse proxy appends the address it actually saw,
 * so the last entry is the trustworthy one.
 */
export function clientIpFromHeaders(h: Headers): string | undefined {
  const last = h.get("x-forwarded-for")?.split(",").pop()?.trim();
  return last || undefined;
}
