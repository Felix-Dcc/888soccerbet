/**
 * Renders a club or league crest as SVG from the catalog's design properties: shape, pattern,
 * emblem, two kit colours and a metallic trim. The club name sits on a banner at the bottom
 * and the founding year is centred below the emblem. Every SVG is self-contained (no external
 * refs) and safe to inline or serve as image/svg+xml.
 */
import type { Club, League, Shape, Pattern, Emblem, Metal, ClubDesign } from "./catalog";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const METALS: Record<Metal, { trim: string; hi: string }> = {
  gold: { trim: "#D4A438", hi: "#FFE89A" },
  silver: { trim: "#B0BCC8", hi: "#EDF1F5" },
  bronze: { trim: "#B27732", hi: "#E8C48A" },
};

// Shape outlines – all drawn in a 200×240 viewBox, centred at 100.
const SHAPES: Record<Shape, { path: string; clip: string }> = {
  shield: {
    path: "M100 10 L185 40 V130 C185 185 100 230 100 230 S15 185 15 130 V40 Z",
    clip: "M100 16 L180 44 V130 C180 180 100 224 100 224 S20 180 20 130 V44 Z",
  },
  round: {
    path: "M100 10 A90 90 0 1 1 99.99 10 Z",
    clip: "M100 18 A82 82 0 1 1 99.99 18 Z",
  },
  heater: {
    path: "M15 10 H185 V140 C185 190 100 230 100 230 S15 190 15 140 Z",
    clip: "M21 16 H179 V138 C179 185 100 224 100 224 S21 185 21 138 Z",
  },
  modern: {
    path: "M100 10 L190 60 V170 L100 230 L10 170 V60 Z",
    clip: "M100 20 L183 65 V167 L100 222 L17 167 V65 Z",
  },
};

// Pattern fills drawn inside the clip
function patternSvg(pat: Pattern, c1: string, c2: string): string {
  switch (pat) {
    case "plain":
      return "";
    case "stripes":
      return `<rect x="40" y="0" width="24" height="240" fill="${c2}"/>
<rect x="100" y="0" width="24" height="240" fill="${c2}"/>
<rect x="160" y="0" width="24" height="240" fill="${c2}"/>`;
    case "hoops":
      return `<rect x="0" y="40" width="200" height="28" fill="${c2}"/>
<rect x="0" y="100" width="200" height="28" fill="${c2}"/>
<rect x="0" y="160" width="200" height="28" fill="${c2}"/>`;
    case "halves":
      return `<rect x="100" y="0" width="100" height="240" fill="${c2}"/>`;
    case "sash":
      return `<polygon points="0,0 50,0 200,200 200,240 150,240 0,40" fill="${c2}" opacity="0.85"/>`;
    case "quarters":
      return `<rect x="100" y="0" width="100" height="120" fill="${c2}"/>
<rect x="0" y="120" width="100" height="120" fill="${c2}"/>`;
    case "chevron":
      return `<polygon points="0,80 100,160 200,80 200,120 100,200 0,120" fill="${c2}" opacity="0.85"/>`;
    case "band":
      return `<rect x="0" y="90" width="200" height="50" fill="${c2}"/>`;
  }
}

function starPoly(cx: number, cy: number, r: number, fill: string) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}

// Emblem devices, drawn centred on (0,0) spanning roughly ±18.
function emblemSvg(emb: Emblem, hi: string, trim: string, deep: string): string {
  switch (emb) {
    case "ball":
      return `<circle r="16" fill="${hi}"/><circle r="16" fill="none" stroke="${deep}" stroke-width="1.4"/>
<polygon points="0,-7 6.8,-2.3 4.2,6 -4.2,6 -6.8,-2.3" fill="${deep}"/>
<path d="M0 -7V-16M6.8 -2.3 15.4 -5.1M4.2 6 9.6 13.2M-4.2 6 -9.6 13.2M-6.8 -2.3 -15.4 -5.1" stroke="${deep}" stroke-width="1.6" fill="none"/>`;
    case "crown":
      return `<path d="M-16 8-16-6-8 2 0-12 8 2 16-6 16 8Z" fill="${hi}"/>
<rect x="-16" y="8" width="32" height="5.5" rx="1.5" fill="${trim}"/>
<circle cx="-16" cy="-7" r="2.8" fill="${trim}"/><circle cy="-13.5" r="3.2" fill="${trim}"/><circle cx="16" cy="-7" r="2.8" fill="${trim}"/>`;
    case "flame":
      return `<path d="M0-18C10-6 14 1.5 6.5 12 3.7 15.4-3.7 15.4-6.5 12-12.8 2.8-5.7-4.3 0-18Z" fill="${hi}"/>
<path d="M0-6C6 0 7.4 4.6 3 10.4 1.4 12.7-1.4 12.7-3 10.4-6.7 5.1-3 0 0-6Z" fill="${trim}"/>`;
    case "bolt":
      return `<polygon points="-1.5,-18 -13.5,4.3 -2.8,4.3 -5.7,18 13.5,-5.7 2.1,-5.7" fill="${hi}"/>`;
    case "wings":
      return `<g fill="none" stroke="${hi}" stroke-width="3.2" stroke-linecap="round">
<path d="M-2.1-4.3C-7.8-10.7-13.5-10.7-17.8-5.7"/><path d="M-2.1 0C-7.8-5-12.8-5-17 0"/><path d="M-2.1 4.3C-7.1-.3-11.3-.3-15.6 4.8"/>
<path d="M2.1-4.3C7.8-10.7 13.5-10.7 17.8-5.7"/><path d="M2.1 0C7.8-5 12.8-5 17 0"/><path d="M2.1 4.3C7.1-.3 11.3-.3 15.6 4.8"/></g>
<polygon points="0,-11.3 4.3,-1.4 0,12.8 -4.3,-1.4" fill="${trim}"/>`;
    case "anchor":
      return `<g stroke="${hi}" stroke-width="3" fill="none" stroke-linecap="round">
<circle cy="-13.5" r="3.8"/><path d="M0-9.7V14.2"/><path d="M-7.4-4.3H7.4"/><path d="M-12.1 4.3C-12.1 13.5-4.3 15.3 0 13.7"/><path d="M12.1 4.3C12.1 13.5 4.3 15.3 0 13.7"/></g>`;
    case "compass":
      return `<circle r="15.6" fill="none" stroke="${hi}" stroke-width="2.1"/>
<polygon points="0,-15.6 3.7,-3.4 0,0 -3.7,-3.4" fill="${hi}"/><polygon points="0,15.6 3.7,3.4 0,0 -3.7,3.4" fill="${trim}"/>
<polygon points="15.6,0 3.4,3.7 0,0 3.4,-3.7" fill="${trim}"/><polygon points="-15.6,0 -3.4,3.7 0,0 -3.4,-3.7" fill="${trim}"/>`;
    case "star":
      return `${starPoly(0, -0.7, 16.3, hi)}${starPoly(0, -0.7, 7.1, trim)}`;
    case "sword":
      return `<polygon points="0,-18.4 3,-7.1 3,8.5 -3,8.5 -3,-7.1" fill="${hi}"/>
<rect x="-8" y="7.1" width="16" height="3.8" rx="1.7" fill="${trim}"/>
<rect x="-2.4" y="10.8" width="4.8" height="6.5" rx="1.4" fill="${trim}"/><circle cy="19" r="2.7" fill="${trim}"/>`;
    case "trident":
      return `<g fill="none" stroke="${hi}" stroke-width="3" stroke-linecap="round">
<path d="M0-15.6V17"/><path d="M-10-15.6V-5.7"/><path d="M10-15.6V-5.7"/><path d="M-10-5.7C-10 1.4 10 1.4 10-5.7"/></g>
<polygon points="0,-19.2 2.8,-14.9 -2.8,-14.9" fill="${hi}"/><polygon points="-10,-19.2 -7.1,-14.9 -12.8,-14.9" fill="${hi}"/><polygon points="10,-19.2 12.8,-14.9 7.1,-14.9" fill="${hi}"/>
<polygon points="-6.4,17 6.4,17 4,20.5 -4,20.5" fill="${trim}"/>`;
    case "sun": {
      let rays = "";
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI / 6) * i;
        rays += `<line x1="${(10 * Math.cos(a)).toFixed(1)}" y1="${(10 * Math.sin(a)).toFixed(1)}" x2="${(17 * Math.cos(a)).toFixed(1)}" y2="${(17 * Math.sin(a)).toFixed(1)}" stroke="${hi}" stroke-width="2.6" stroke-linecap="round"/>`;
      }
      return `${rays}<circle r="8" fill="${hi}"/>`;
    }
    case "gem":
      return `<polygon points="0,-15.6 10.6,-4.3 0,17.7 -10.6,-4.3" fill="${hi}"/>
<polygon points="0,-15.6 10.6,-4.3 0,-4.3 -10.6,-4.3" fill="${trim}"/>
<path d="M-10.6-4.3H10.6M0-15.6V17.7M-5.3-4.3 0 17.7 5.3-4.3" stroke="${deep}" stroke-width="0.9" fill="none" opacity="0.7"/>`;
    case "mountain":
      return `<polygon points="-17,15.6 -5,-8.5 2.1,2.8 10,-14.2 17,15.6" fill="${hi}"/>
<polygon points="10,-14.2 14.2,-5.7 5.7,-5.7" fill="${deep}" opacity="0.55"/><polygon points="-5,-8.5 -1.1-.9 -8.8-.9" fill="${deep}" opacity="0.55"/>`;
    case "paw":
      return `<ellipse cy="6.4" rx="9.4" ry="8" fill="${hi}"/>
<circle cx="-8.8" cy="-3.5" r="3.4" fill="${hi}"/><circle cx="-3" cy="-9.4" r="3.8" fill="${hi}"/><circle cx="3.3" cy="-9.4" r="3.8" fill="${hi}"/><circle cx="8.8" cy="-3.5" r="3.4" fill="${hi}"/>`;
    case "tower":
      return `<rect x="-9" y="-8" width="18" height="26" fill="${hi}"/>
<rect x="-12" y="-14" width="5" height="7" fill="${hi}"/><rect x="-2.5" y="-14" width="5" height="7" fill="${hi}"/><rect x="7" y="-14" width="5" height="7" fill="${hi}"/>
<rect x="-3" y="6" width="6" height="12" rx="3" fill="${deep}" opacity="0.6"/>
<rect x="-12" y="-8" width="24" height="3" fill="${trim}"/>`;
    case "wave":
      return `<path d="M-18 0 C-12-8-6-8 0 0 S12-8 18 0 V14 H-18 Z" fill="${hi}"/>
<path d="M-18 6 C-12-2-6-2 0 6 S12-2 18 6 V14 H-18 Z" fill="${trim}" opacity="0.6"/>`;
    case "tree":
      return `<rect x="-2.5" y="4" width="5" height="14" fill="${trim}"/>
<polygon points="0,-18 14,6 -14,6" fill="${hi}"/>
<polygon points="0,-10 10,2 -10,2" fill="${hi}"/>`;
  }
}

/** Render a club crest SVG (200×240 viewBox, self-contained). */
export function renderClubCrest(club: Club | (ClubDesign & { name: string; town: string; founded: number })): string {
  const m = METALS[club.metal];
  const shape = SHAPES[club.shape];
  const [c1, c2] = club.colors;
  const deep = darken(c1);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240" role="img" aria-label="${esc(club.name)} crest">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
  <linearGradient id="tm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.hi}"/><stop offset="1" stop-color="${m.trim}"/></linearGradient>
  <clipPath id="body"><path d="${shape.clip}"/></clipPath>
</defs>
<!-- Outer trim -->
<path d="${shape.path}" fill="url(#tm)"/>
<!-- Body -->
<path d="${shape.clip}" fill="url(#bg)"/>
<!-- Pattern -->
<g clip-path="url(#body)" opacity="0.8">${patternSvg(club.pattern, c1, c2)}</g>
<!-- Emblem -->
<g transform="translate(100 ${club.shape === "round" ? 105 : 115})">${emblemSvg(club.emblem, m.hi, m.trim, deep)}</g>
<!-- Club name banner -->
<text x="100" y="${club.shape === "round" ? 175 : 200}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="${nameFontSize(club.name)}" fill="${m.hi}" stroke="${deep}" stroke-width="0.6" letter-spacing="1">${esc(club.name.toUpperCase())}</text>
<!-- Est. year -->
<text x="100" y="${club.shape === "round" ? 192 : 218}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="10" fill="${m.trim}" letter-spacing="2">EST. ${club.founded}</text>
</svg>`;
}

/** Render a league crest SVG (round badge, 200×200 viewBox). */
export function renderLeagueCrest(league: League): string {
  const [c1, c2] = league.colors;
  const deep = darken(c1);
  const dots = Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI / 8) * i;
    return `<circle cx="${(100 + 80 * Math.cos(a)).toFixed(1)}" cy="${(100 + 80 * Math.sin(a)).toFixed(1)}" r="2" fill="${c2}" opacity="0.7"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${esc(league.name)} emblem">
<defs>
  <radialGradient id="lg" cx="0.5" cy="0.4" r="0.65"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
</defs>
<circle cx="100" cy="100" r="96" fill="${c2}"/>
<circle cx="100" cy="100" r="90" fill="url(#lg)"/>
<circle cx="100" cy="100" r="90" fill="none" stroke="${c2}" stroke-width="2" opacity="0.3"/>
${dots}
${starPoly(100, 42, 10, c2)}
<text x="100" y="185" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="${nameFontSize(league.name)}" fill="${c2}" letter-spacing="1.5">${esc(league.name.toUpperCase())}</text>
</svg>`;
}

function nameFontSize(name: string): number {
  if (name.length > 24) return 9;
  if (name.length > 18) return 10;
  if (name.length > 12) return 11.5;
  return 13;
}

function darken(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 40);
  const g = Math.max(0, ((n >> 8) & 0xff) - 40);
  const b = Math.max(0, (n & 0xff) - 40);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
