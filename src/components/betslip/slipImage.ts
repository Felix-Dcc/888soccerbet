/**
 * Draws a booked slip as a shareable PNG, laid out like a printed betslip: brand bar with the
 * booking time, booking code and total odds on a dark panel, then a white card with an
 * example bet (GHS 100 at the slip's real total odds — no invented bonus) and each selection.
 * Canvas in the browser, so it uses the page's own fonts and needs no server work.
 */
import { combineMilliOdds, formatMilliOdds, formatPesewas, potentialPayout } from "@/lib/money";
import { formatStamp } from "@/lib/time";
import type { Pick } from "./BetslipContext";

const W = 1080;
const PAD = 48; // dark margin around the white card
const IN = 48; // text inset inside the white card
const C = {
  brand: "#0F8A3C",
  brandDark: "#0B6B2F",
  panel: "#131A24",
  code: "#C6F24E",
  ink: "#0B1220",
  fog: "#4B5565",
  line: "#E2E7EE",
  band: "#E7F4EC",
  bandText: "#0C7C36",
  gold: "#F5C451",
};
const EXAMPLE_STAKE = 10_000n; // GHS 100 in pesewas

/** Resolve the hashed next/font family names from the CSS variables the layout sets. */
function fonts() {
  const css = getComputedStyle(document.body);
  const body = css.getPropertyValue("--font-body").trim() || "system-ui, sans-serif";
  const display = css.getPropertyValue("--font-display").trim() || body;
  return { body, display };
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

/** "Home"/"Away" mean nothing out of context on a shared picture; name the team instead. */
function pickLabel(p: Pick): string {
  const [home, away] = p.fixtureName.split(" v ");
  if (p.selectionName === "Home" && home) return home;
  if (p.selectionName === "Away" && away) return away;
  return p.selectionName;
}

function crown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.moveTo(7.5, 21.2); ctx.lineTo(6, 11.2); ctx.lineTo(11.6, 15.5); ctx.lineTo(16, 7.8);
  ctx.lineTo(20.4, 15.5); ctx.lineTo(26, 11.2); ctx.lineTo(24.5, 21.2); ctx.closePath();
  ctx.fill();
  ctx.fillRect(7.5, 22.2, 17, 3);
  for (const [cx, cy, r] of [[6, 10.6, 1.5], [26, 10.6, 1.5], [16, 6.9, 1.8]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The wordmark's little crown, centred at x with its base at y, `w` pixels wide. */
function wordmarkCrown(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const k = w / 24; // drawn in the same 24x16 box as the site's SVG
  ctx.save();
  ctx.translate(x - 12 * k, y - 15 * k);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(2, 14); ctx.lineTo(1, 4); ctx.lineTo(7, 8.5); ctx.lineTo(12, 1);
  ctx.lineTo(17, 8.5); ctx.lineTo(23, 4); ctx.lineTo(22, 14); ctx.closePath();
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#B9831A";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, 1.8, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = "#FFE7A3";
  ctx.fill();
  ctx.restore();
}

export async function drawSlipImage(code: string, picks: Pick[], bookedAt: Date = new Date()): Promise<Blob> {
  const f = fonts();
  // Weights the canvas uses may not be on screen yet; load them before drawing.
  await Promise.all(
    [`800 40px ${f.display}`, `800 36px ${f.body}`, `700 30px ${f.body}`, `600 30px ${f.body}`, `500 30px ${f.body}`].map((x) => document.fonts.load(x).catch(() => [])),
  );

  const combined = combineMilliOdds(picks.map((p) => p.milliOdds));
  const BAR = 150;
  const PANEL = 400;
  const BAND = 68;
  const ROW = 60;
  const SEL = 196;
  const cardTop = BAR + PANEL;
  const cardH = BAND + ROW * 2 + 24 + BAND + picks.length * SEL;
  const H = cardTop + cardH + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "middle";

  // Brand bar: logo left, "Betslip" + booking time right.
  const grad = ctx.createLinearGradient(0, 0, W, BAR);
  grad.addColorStop(0, C.brand);
  grad.addColorStop(1, C.brandDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, BAR);
  crown(ctx, PAD, BAR / 2 - 34, 68);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 46px ${f.display}`;
  ctx.fillText("Kingz Bet", PAD + 84, BAR / 2);
  // Small crown on the "z", as in the site's wordmark.
  const sx = PAD + 84 + ctx.measureText("King").width + ctx.measureText("z").width / 2;
  wordmarkCrown(ctx, sx, BAR / 2 - 46 * 0.44, 46 * 0.6);
  ctx.textAlign = "right";
  ctx.font = `700 30px ${f.body}`;
  ctx.fillText("Betslip", W - PAD, BAR / 2 - 20);
  ctx.font = `600 30px ${f.body}`;
  ctx.fillText(formatStamp(bookedAt), W - PAD, BAR / 2 + 22);

  // Dark panel: booking code and total odds.
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, BAR, W, H - BAR);
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 32px ${f.body}`;
  ctx.fillText("Booking Code", W / 2, BAR + 64);
  ctx.fillStyle = C.code;
  ctx.font = `800 104px ${f.display}`;
  ctx.fillText(code, W / 2, BAR + 160);

  const boxW = 620;
  const boxX = (W - boxW) / 2;
  const boxY = BAR + 236;
  ctx.fillStyle = "rgba(255,255,255,.06)";
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, 104, 12);
  ctx.fill();
  ctx.fillStyle = C.code;
  ctx.fillRect(boxX, boxY + 100, boxW, 4);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 32px ${f.body}`;
  ctx.fillText("Odds", boxX + 32, boxY + 52);
  ctx.textAlign = "right";
  ctx.font = `800 52px ${f.display}`;
  ctx.fillText(formatMilliOdds(combined), boxX + boxW - 32, boxY + 52);

  // White card.
  const cx = PAD;
  const cw = W - PAD * 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(cx, cardTop, cw, cardH);
  let y = cardTop;

  const band = (label: string) => {
    ctx.fillStyle = C.band;
    ctx.fillRect(cx, y, cw, BAND);
    ctx.fillStyle = C.bandText;
    ctx.textAlign = "left";
    ctx.font = `700 30px ${f.body}`;
    ctx.fillText(label, cx + IN - 16, y + BAND / 2);
    y += BAND;
  };
  const row = (label: string, value: string) => {
    ctx.fillStyle = C.ink;
    ctx.font = `500 34px ${f.body}`;
    ctx.textAlign = "left";
    ctx.fillText(label, cx + IN - 16, y + ROW / 2 + 6);
    ctx.textAlign = "right";
    ctx.fillText(value, cx + cw - IN + 16, y + ROW / 2 + 6);
    y += ROW;
  };

  band("Example Bet");
  row("Stake", formatPesewas(EXAMPLE_STAKE));
  row("Payout", formatPesewas(potentialPayout(EXAMPLE_STAKE, combined)));
  y += 24;
  band("Selections");

  const textMax = cw - IN * 2 - 150;
  picks.forEach((p, i) => {
    if (i > 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(cx + IN - 16, y, cw - (IN - 16) * 2, 2);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = C.ink;
    ctx.font = `800 40px ${f.body}`;
    ctx.fillText(fit(ctx, pickLabel(p), textMax), cx + IN - 16, y + 52);
    ctx.textAlign = "right";
    ctx.font = `800 40px ${f.display}`;
    ctx.fillText(formatMilliOdds(p.milliOdds), cx + cw - IN + 16, y + 52);
    ctx.textAlign = "left";
    ctx.fillStyle = C.fog;
    ctx.font = `500 32px ${f.body}`;
    ctx.fillText(fit(ctx, p.fixtureName.replace(" v ", " vs "), cw - IN * 2), cx + IN - 16, y + 108);
    ctx.fillStyle = C.ink;
    ctx.font = `700 32px ${f.body}`;
    ctx.fillText(fit(ctx, p.marketName, cw - IN * 2), cx + IN - 16, y + 156);
    y += SEL;
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
