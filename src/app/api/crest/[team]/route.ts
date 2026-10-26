/**
 * Crest for a team with no real badge (the generated fictional sides, and manual games the feed
 * doesn't know). Drawn from the name alone, so the same team always gets the same badge and no
 * image needs storing. Never served for real clubs: cached feed badges are applied first.
 */
export const dynamic = "force-static";

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

const initials = (name: string) => {
  const words = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(_req: Request, { params }: { params: Promise<{ team: string }> }) {
  const raw = decodeURIComponent((await params).team).slice(0, 60) || "FC";
  const h = hash(raw);
  const hue = h % 360;
  const alt = (hue + 145) % 360;
  const dark = `hsl(${hue} 55% 22%)`;
  const mid = `hsl(${hue} 60% 38%)`;
  const accent = `hsl(${alt} 70% 55%)`;
  // A shield with a chevron band and the team's initials: reads as a badge at 20px and at 96px.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(raw)} crest">
<path d="M32 3 58 11v24c0 14-11 23-26 26C17 58 6 49 6 35V11Z" fill="${dark}" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M32 8 53 14v21c0 11-9 19-21 21-12-2-21-10-21-21V14Z" fill="${mid}"/>
<path d="M11 30h42v7H11Z" fill="${accent}" opacity="0.9"/>
<circle cx="32" cy="18" r="4" fill="${accent}"/>
<text x="32" y="51" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="bold" fill="#ffffff">${esc(initials(raw))}</text>
</svg>`;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable", // the name fully determines the badge
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", // inert even if opened directly
    },
  });
}
