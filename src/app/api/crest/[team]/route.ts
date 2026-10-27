/**
 * Original badge for a side (or competition) with no real artwork: the generated fictional teams,
 * fictional leagues, and manual games the feed doesn't know. Drawn from the name alone, so the same
 * name always gets the same badge and nothing is stored. Never served for real clubs or leagues:
 * cached feed badges are applied first. `?kind=league` draws a round league emblem instead of a
 * team shield. The central device is an emblem (no initials); its motif follows the name's theme,
 * with a stable fallback otherwise. These are original marks, not imitations of any real club or
 * competition.
 */
// Dynamic so `?kind=league` is read (force-static drops query params); the immutable cache header
// below still serves every repeat of a given URL from the browser/CDN, so the handler runs rarely.
export const dynamic = "force-dynamic";

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
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

/** Palette from the name: a two-tone body plus a gold, silver or bronze metallic trim (deterministic). */
function palette(h: number) {
  const hue = h % 360;
  const metal = [
    { trim: "#E7C46A", trimHi: "#FFF0C0" }, // gold
    { trim: "#CFD8E3", trimHi: "#FFFFFF" }, // silver
    { trim: "#C8894B", trimHi: "#F0C89A" }, // bronze
  ][(h >> 3) % 3]!;
  return {
    deep: `hsl(${hue} 58% 15%)`,
    mid: `hsl(${hue} 56% 29%)`,
    light: `hsl(${hue} 52% 40%)`,
    ...metal,
  };
}

type Palette = ReturnType<typeof palette>;

/** Emblem devices, each drawn centred on (0,0) spanning roughly ±12. No text. */
const DEVICES: Record<string, (p: Palette) => string> = {
  ball: (p) =>
    `<circle r="11.5" fill="${p.trimHi}"/><circle r="11.5" fill="none" stroke="${p.deep}" stroke-width="1"/>
<polygon points="0,-5 4.8,-1.6 3,4.2 -3,4.2 -4.8,-1.6" fill="${p.deep}"/>
<path d="M0 -5V-11.5M4.8 -1.6 10.9 -3.6M3 4.2 6.8 9.3M-3 4.2 -6.8 9.3M-4.8 -1.6 -10.9 -3.6" stroke="${p.deep}" stroke-width="1.3" fill="none"/>`,
  crown: (p) =>
    `<path d="M-11 6-11-4-5.5 1.5 0-8 5.5 1.5 11-4 11 6Z" fill="${p.trimHi}"/>
<rect x="-11" y="6" width="22" height="4" rx="1.2" fill="${p.trim}"/>
<circle cx="-11" cy="-5" r="2" fill="${p.trim}"/><circle cy="-9.5" r="2.3" fill="${p.trim}"/><circle cx="11" cy="-5" r="2" fill="${p.trim}"/>`,
  flame: (p) =>
    `<path d="M0-12.5C7-4 10 1 4.6 8.2 2.6 10.8-2.6 10.8-4.6 8.2-9 2-4-3 0-12.5Z" fill="${p.trimHi}"/>
<path d="M0-4C4.2 0 5.2 3.2 2.1 7.3 1 8.9-1 8.9-2.1 7.3-4.7 3.6-2.1 0 0-4Z" fill="${p.trim}"/>`,
  bolt: (p) => `<polygon points="-1,-12.5 -9.5,3 -2,3 -4,12.5 9.5,-4 1.5,-4" fill="${p.trimHi}"/>`,
  wings: (p) =>
    `<g fill="none" stroke="${p.trimHi}" stroke-width="2.4" stroke-linecap="round">
<path d="M-1.5-3C-5.5-7.5-9.5-7.5-12.5-4"/><path d="M-1.5 0C-5.5-3.5-9-3.5-12 0"/><path d="M-1.5 3C-5-.2-8-.2-11 3.4"/>
<path d="M1.5-3C5.5-7.5 9.5-7.5 12.5-4"/><path d="M1.5 0C5.5-3.5 9-3.5 12 0"/><path d="M1.5 3C5-.2 8-.2 11 3.4"/></g>
<polygon points="0,-8 3,-1 0,9 -3,-1" fill="${p.trim}"/>`,
  anchor: (p) =>
    `<g stroke="${p.trimHi}" stroke-width="2.3" fill="none" stroke-linecap="round">
<circle cy="-9.5" r="2.7"/><path d="M0-6.8V10"/><path d="M-5.2-3H5.2"/><path d="M-8.5 3C-8.5 9.5-3 10.8 0 9.6"/><path d="M8.5 3C8.5 9.5 3 10.8 0 9.6"/></g>`,
  compass: (p) =>
    `<circle r="11" fill="none" stroke="${p.trimHi}" stroke-width="1.6"/>
<polygon points="0,-11 2.6,-2.4 0,0 -2.6,-2.4" fill="${p.trimHi}"/><polygon points="0,11 2.6,2.4 0,0 -2.6,2.4" fill="${p.trim}"/>
<polygon points="11,0 2.4,2.6 0,0 2.4,-2.6" fill="${p.trim}"/><polygon points="-11,0 -2.4,2.6 0,0 -2.4,-2.6" fill="${p.trim}"/>`,
  star: (p) => `${star(0, -0.5, 11.5, p.trimHi)}${star(0, -0.5, 5, p.trim)}`,
  sword: (p) =>
    `<polygon points="0,-13 2.1,-5 2.1,6 -2.1,6 -2.1,-5" fill="${p.trimHi}"/>
<rect x="-5.6" y="5" width="11.2" height="2.7" rx="1.2" fill="${p.trim}"/>
<rect x="-1.7" y="7.6" width="3.4" height="4.6" rx="1" fill="${p.trim}"/><circle cy="13.4" r="1.9" fill="${p.trim}"/>`,
  trident: (p) =>
    `<g fill="none" stroke="${p.trimHi}" stroke-width="2.3" stroke-linecap="round">
<path d="M0-11V12"/><path d="M-7-11V-4"/><path d="M7-11V-4"/><path d="M-7-4C-7 1 7 1 7-4"/></g>
<polygon points="0,-13.5 2,-10.5 -2,-10.5" fill="${p.trimHi}"/><polygon points="-7,-13.5 -5,-10.5 -9,-10.5" fill="${p.trimHi}"/><polygon points="7,-13.5 9,-10.5 5,-10.5" fill="${p.trimHi}"/>
<polygon points="-4.5,12 4.5,12 2.8,14.5 -2.8,14.5" fill="${p.trim}"/>`,
  sun: (p) => {
    let rays = "";
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI / 6) * i;
      rays += `<line x1="${(7 * Math.cos(a)).toFixed(1)}" y1="${(7 * Math.sin(a)).toFixed(1)}" x2="${(12 * Math.cos(a)).toFixed(1)}" y2="${(12 * Math.sin(a)).toFixed(1)}" stroke="${p.trimHi}" stroke-width="2" stroke-linecap="round"/>`;
    }
    return `${rays}<circle r="5.6" fill="${p.trimHi}"/>`;
  },
  gem: (p) =>
    `<polygon points="0,-11 7.5,-3 0,12.5 -7.5,-3" fill="${p.trimHi}"/>
<polygon points="0,-11 7.5,-3 0,-3 -7.5,-3" fill="${p.trim}"/>
<path d="M-7.5-3H7.5M0-11V12.5M-3.8-3 0 12.5 3.8-3" stroke="${p.deep}" stroke-width="0.7" fill="none" opacity="0.7"/>`,
  mountain: (p) =>
    `<polygon points="-12,11 -3.5,-6 1.5,2 7,-10 12,11" fill="${p.trimHi}"/>
<polygon points="7,-10 10,-4 4,-4" fill="${p.deep}" opacity="0.55"/><polygon points="-3.5,-6 -0.8,-0.6 -6.2,-0.6" fill="${p.deep}" opacity="0.55"/>`,
  paw: (p) =>
    `<ellipse cy="4.5" rx="6.6" ry="5.6" fill="${p.trimHi}"/>
<circle cx="-6.2" cy="-2.5" r="2.4" fill="${p.trimHi}"/><circle cx="-2.1" cy="-6.6" r="2.7" fill="${p.trimHi}"/><circle cx="2.3" cy="-6.6" r="2.7" fill="${p.trimHi}"/><circle cx="6.2" cy="-2.5" r="2.4" fill="${p.trimHi}"/>`,
};

const KEYWORDS: [RegExp, string][] = [
  [/phoenix|flame|fire|blaze|ember|volcanic|inferno/i, "flame"],
  [/thunder|electric|storm|bolt|volt|spark|hurricane|cyclone/i, "bolt"],
  [/hawk|harrier|falcon|eagle|raven|kestrel|griffin|wing/i, "wings"],
  [/monarch|royal|king|crown|regal|emperor|imperial|majestic/i, "crown"],
  [/mariner|anchor|harbor|harbour|port|sail|tidal|admiral|corsair/i, "anchor"],
  [/nomad|rover|wanderer|drifter|ranger|pioneer|voyager|scout/i, "compass"],
  [/gladiator|spartan|centurion|warrior|knight|lancer|crusader|legion|reaper|valkyrie|vanguard|raider|outlaw/i, "sword"],
  [/trident|viper|cobra|serpent|hydra|dragon/i, "trident"],
  [/panther|jaguar|puma|wolf|wolves|lion|tiger|cat|cougar/i, "paw"],
  [/titan|granite|iron|steel|highland|summit|peak|mountain|stone/i, "mountain"],
  [/solar|sun|radiant|dawn|nova|comet|vivid/i, "sun"],
  [/ruby|crystal|sapphire|jade|emerald|gem|diamond|obsidian|onyx|amber/i, "gem"],
  [/united|city|fc|club|athletic|sporting/i, "ball"],
];

function device(name: string, h: number): (p: Palette) => string {
  for (const [re, key] of KEYWORDS) if (re.test(name)) return DEVICES[key]!;
  const keys = Object.keys(DEVICES);
  return DEVICES[keys[h % keys.length]!]!;
}

function teamCrest(name: string, h: number) {
  const p = palette(h);
  // Vary the stars above the device and the direction of the sheen, so same-device badges still differ.
  const starRow = [[26, 32, 38], [28, 36], []][(h >> 7) % 3]!;
  const stars = starRow.map((x) => star(x, 14, 2.3, p.trim)).join("");
  const sash = (h >> 9) % 2 === 0 ? "M-6 44 44 -6 58 8 8 58Z" : "M70 44 20 -6 6 8 56 58Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(name)} crest">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.trimHi}"/><stop offset="1" stop-color="${p.trim}"/></linearGradient>
<clipPath id="s"><path d="M32 6 54 12v19c0 13-9 21-22 25-13-4-22-12-22-25V12Z"/></clipPath>
</defs>
<path d="M32 3 57 10v21c0 14-10 24-25 28C17 55 7 45 7 31V10Z" fill="url(#t)"/>
<path d="M32 6 54 12v19c0 13-9 21-22 25-13-4-22-12-22-25V12Z" fill="url(#b)"/>
<g clip-path="url(#s)"><path d="${sash}" fill="${p.light}" opacity="0.35"/></g>
${stars}
<g transform="translate(32 ${starRow.length ? 35 : 33})">${device(name, h)(p)}</g>
</svg>`;
}

function leagueCrest(name: string, h: number) {
  const p = palette(h);
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
${star(32, 16, 4, p.trim)}
<g transform="translate(32 35)">${DEVICES.ball!(p)}</g>
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
