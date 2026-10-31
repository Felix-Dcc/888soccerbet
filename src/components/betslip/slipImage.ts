/**
 * Draws a booked slip as a shareable PNG, laid out like a printed betslip: brand bar with the
 * booking time, booking code and total odds on a dark panel, then a white card with an
 * example bet (GHS 100 at the slip's real total odds — no invented bonus) and each selection.
 * Canvas in the browser, so it uses the page's own fonts and needs no server work.
 */
import { combineMilliOdds, formatMilliOdds, formatPesewas, potentialPayout } from "@/lib/money";
import { formatStamp } from "@/lib/time";
import type { Pick } from "./BetslipContext";
import logoArt from "../../../public/img/brand/888soccerbet-logo.png";

const W = 1080;
const PAD = 48; // dark margin around the white card
const IN = 48; // text inset inside the white card
const C = {
  brand: "#17211B",
  brandDark: "#0A0F0C",
  panel: "#111814",
  code: "#3CDC3C",
  ink: "#0A0F0C",
  fog: "#4E5D53",
  line: "#E1E8E3",
  band: "#E5F6E5",
  bandText: "#167516",
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

/** The real logo, decoded before drawing; null if it can't load (the wordmark is drawn instead). */
async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = logoArt.src;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

export async function drawSlipImage(code: string, picks: Pick[], bookedAt: Date = new Date()): Promise<Blob> {
  const f = fonts();
  // Weights the canvas uses may not be on screen yet; load them before drawing.
  await Promise.all(
    [`800 40px ${f.display}`, `800 36px ${f.body}`, `700 30px ${f.body}`, `600 30px ${f.body}`, `500 30px ${f.body}`].map((x) => document.fonts.load(x).catch(() => [])),
  );

  const logo = await loadLogo();
  const combined = combineMilliOdds(picks.map((p) => p.milliOdds));
  const BAR = 190;
  const PANEL = 400;
  const BAND = 68;
  const ROW = 60;
  const SEL = 196;
  const cardTop = BAR + PANEL;
  const cardH = BAND + ROW * 2 + 24 + BAND + picks.length * SEL;
  const FOOT = 110; // domain + 18+ line under the card
  const H = cardTop + cardH + FOOT;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "middle";

  // Brand bar: the real logo left, "BETSLIP" + booking time right, on the night-pitch body
  // with the logo's speed swoosh behind it.
  const grad = ctx.createLinearGradient(0, 0, W, BAR);
  grad.addColorStop(0, C.brand);
  grad.addColorStop(1, C.brandDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, BAR);
  ctx.fillStyle = "rgba(60,220,60,.14)";
  ctx.beginPath();
  ctx.moveTo(W * 0.35, BAR);
  ctx.quadraticCurveTo(W * 0.62, BAR * 0.2, W + 20, BAR * 0.05);
  ctx.quadraticCurveTo(W * 0.66, BAR * 0.5, W * 0.42, BAR);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.code;
  ctx.fillRect(0, BAR - 4, W, 4);
  if (logo) {
    const lh = 128;
    ctx.drawImage(logo, PAD, (BAR - lh) / 2, (logo.width / logo.height) * lh, lh);
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 46px ${f.display}`;
    ctx.fillText("888SOCCER", PAD, BAR / 2);
    ctx.fillStyle = C.code;
    ctx.fillText("BET", PAD + ctx.measureText("888SOCCER").width, BAR / 2);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 34px ${f.display}`;
  ctx.fillText("BETSLIP", W - PAD, BAR / 2 - 20);
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = `600 28px ${f.body}`;
  ctx.fillText(formatStamp(bookedAt), W - PAD, BAR / 2 + 24);

  // Dark panel: booking code and total odds.
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, BAR, W, H - BAR);
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = `700 28px ${f.body}`;
  ctx.fillText("BOOKING CODE", W / 2, BAR + 64);
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
  ctx.fillStyle = C.gold;
  ctx.fillRect(boxX, boxY + 100, boxW, 4);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 32px ${f.body}`;
  ctx.fillText("Total odds", boxX + 32, boxY + 52);
  ctx.textAlign = "right";
  ctx.fillStyle = C.gold;
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

  // Footer: where the code works, and the age/harm line a shared betting picture should carry.
  const fy = cardTop + cardH + FOOT / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 30px ${f.display}`;
  ctx.fillText("888soccerbet.com", PAD, fy);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.font = `600 26px ${f.body}`;
  ctx.fillText("18+ · Play responsibly", W - PAD, fy);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
