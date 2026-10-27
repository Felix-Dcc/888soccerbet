/**
 * Original badge for a side (or competition) with no real artwork: the generated fictional teams,
 * fictional leagues, and manual games the feed doesn't know. Drawn from the name alone, so the same
 * name always gets the same badge and nothing is stored. Never served for real clubs or leagues:
 * cached feed badges are applied first. `?kind=league` draws a round league emblem instead of a
 * team shield. These are original marks, not imitations of any real club or competition.
 */
// Dynamic so `?kind=league` is read (force-static drops query params); the immutable cache header
// below still serves every repeat of a given URL from the browser/CDN, so the handler runs rarely.
export const dynamic = "force-dynamic";

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0);
  return h;
};

const initials = (name: string) => {
  const words = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : name.slice(0, 2)).toUpperCase();
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A five-point star centred at (cx,cy), outer radius r. */
function star(cx: number, cy: number, r: number, fill: string) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}

/** Palette from the name: a two-tone body plus a gold or silver metallic trim (deterministic). */
function palette(h: number) {
  const hue = h % 360;
  const gold = (h >> 3) % 2 === 0;
  return {
    deep: `hsl(${hue} 58% 16%)`,
    mid: `hsl(${hue} 56% 30%)`,
    light: `hsl(${hue} 52% 40%)`,
    trim: gold ? "#E7C46A" : "#D7DEE8",
    trimHi: gold ? "#FFF0C0" : "#FFFFFF",
  };
}

function teamCrest(name: string, h: number) {
  const p = palette(h);
  const ini = esc(initials(name));
  const stars = [26, 32, 38].map((x) => star(x, 15, 3, p.trim)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(name)} crest">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.trimHi}"/><stop offset="1" stop-color="${p.trim}"/></linearGradient>
<clipPath id="s"><path d="M32 6 54 12v19c0 13-9 21-22 25-13-4-22-12-22-25V12Z"/></clipPath>
</defs>
<path d="M32 3 57 10v21c0 14-10 24-25 28C17 55 7 45 7 31V10Z" fill="url(#t)"/>
<path d="M32 6 54 12v19c0 13-9 21-22 25-13-4-22-12-22-25V12Z" fill="url(#b)"/>
<g clip-path="url(#s)">
<path d="M-6 44 44 -6 58 8 8 58Z" fill="${p.light}" opacity="0.5"/>
<rect x="10" y="26" width="44" height="12" fill="${p.deep}" opacity="0.55"/>
</g>
${stars}
<text x="32" y="43" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="#ffffff" style="paint-order:stroke" stroke="${p.deep}" stroke-width="0.6">${ini}</text>
</svg>`;
}

function leagueCrest(name: string, h: number) {
  const p = palette(h);
  const ini = esc(initials(name));
  const dots = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI / 6) * i;
    return `<circle cx="${(32 + 25 * Math.cos(a)).toFixed(1)}" cy="${(32 + 25 * Math.sin(a)).toFixed(1)}" r="1.1" fill="${p.trim}" opacity="0.85"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(name)} emblem">
<defs>
<radialGradient id="g" cx="0.5" cy="0.38" r="0.7"><stop offset="0" stop-color="${p.light}"/><stop offset="1" stop-color="${p.deep}"/></radialGradient>
<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.trimHi}"/><stop offset="1" stop-color="${p.trim}"/></linearGradient>
</defs>
<circle cx="32" cy="32" r="29" fill="url(#r)"/>
<circle cx="32" cy="32" r="26.5" fill="url(#g)"/>
<circle cx="32" cy="32" r="20" fill="none" stroke="${p.trim}" stroke-width="1" opacity="0.7"/>
${dots}
${star(32, 17, 4.5, p.trim)}
<text x="32" y="42" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800" letter-spacing="0.5" fill="#ffffff" style="paint-order:stroke" stroke="${p.deep}" stroke-width="0.6">${ini}</text>
</svg>`;
}

export async function GET(req: Request, { params }: { params: Promise<{ team: string }> }) {
  const raw = decodeURIComponent((await params).team).slice(0, 60) || "FC";
  const kind = new URL(req.url).searchParams.get("kind");
  const h = hash(raw);
  const svg = kind === "league" ? leagueCrest(raw, h) : teamCrest(raw, h);
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable", // the name fully determines the badge
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", // inert even if opened directly
    },
  });
}
