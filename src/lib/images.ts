/**
 * TheSportsDB serves resized variants by URL suffix (/tiny ≈50px, /small ≈250px, /medium ≈500px).
 * Browser-safe; other hosts' URLs are returned untouched.
 */
export function sized(url: string | null | undefined, size: "tiny" | "small" | "medium"): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return url; // our own generated crest: already the right size
  try {
    const host = new URL(url).hostname;
    return host.endsWith("thesportsdb.com") ? `${url}/${size}` : url;
  } catch {
    return null; // malformed URL from a feed: show the fallback instead
  }
}
