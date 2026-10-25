"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { Logo } from "./Logo";
import { ShareTicket } from "./ShareTicket";

interface Win {
  id: string;
  ref: string;
  type: string;
  payout: string; // pesewas (bigint serialised)
  legs: number;
  verifyCode: string;
  beatPct: number | null; // from real recent wins; null when there are too few to compare
}

const POLL_MS = 60_000;

/**
 * "YOU WON" celebration: when a bet settles as a win, the player gets a full-screen moment with
 * the amount, a gold trophy and the ticket's verify code. Wins queue up and show one at a time
 * (oldest first); closing one records it as seen on the server, so it never shows twice, on any
 * device. Checks on load, on login/bet/wallet events, when the tab regains focus, and every
 * minute while visible. Signed-out visitors just get an empty list.
 */
export function WinningPopup() {
  const [queue, setQueue] = useState<Win[]>([]);
  const busy = useRef(false);
  const known = useRef(new Set<string>()); // ids already queued: only genuinely new wins trigger a refresh

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const r = await fetch("/api/me/wins", { cache: "no-store" });
      if (!r.ok) return; // server error: try again on the next tick
      const { wins } = (await r.json()) as { wins: Win[] };
      const fresh = wins.filter((w) => !known.current.has(w.id));
      if (fresh.length) {
        fresh.forEach((w) => known.current.add(w.id));
        setQueue((q) => [...q, ...fresh]);
        window.dispatchEvent(new Event("stakra:refresh")); // the header balance now includes the winnings
      }
    } catch {
      /* offline: try again on the next tick */
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    window.addEventListener("stakra:refresh", onFocus); // login, bets, wallet changes
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(onFocus, POLL_MS);
    return () => {
      window.removeEventListener("stakra:refresh", onFocus);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(t);
    };
  }, [check]);

  const win = queue[0];
  const close = useCallback(() => {
    if (!win) return;
    setQueue((q) => q.slice(1));
    void fetch("/api/me/wins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [win.id] }) }).catch(() => {});
  }, [win]);

  if (!win) return null;
  return createPortal(<WinCard key={win.id} win={win} remaining={queue.length - 1} onClose={close} />, document.body);
}

/** Counts up to the amount (eased); instant for players who prefer reduced motion. */
function useCountUp(target: bigint, ms = 1500) {
  const [value, setValue] = useState(0n);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setValue(target);
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setValue(BigInt(Math.round(Number(target) * (1 - Math.pow(1 - p, 3)))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function WinCard({ win, remaining, onClose }: { win: Win; remaining: number; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind stays put
    // Capture + stop: Escape closes this pop-up only, never a drawer underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const payout = BigInt(win.payout);
  const amount = formatPesewas(payout);
  const shown = formatPesewas(useCountUp(payout));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="win-title" aria-describedby="win-amount" className="theme-dark fixed inset-0 z-[70] overflow-y-auto">
      {/* See-through: the page stays visible behind, dimmed and softly blurred. */}
      <div className="fixed inset-0 animate-fade-in bg-[#04060A]/55 backdrop-blur-[6px]" onClick={onClose} />
      <Confetti />
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close"
        className="fixed right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full text-2xl text-white/85 transition hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>

      <div className="relative z-10 flex min-h-full items-center justify-center px-5 py-14">
        <div className="w-full max-w-sm animate-win-pop text-center [text-shadow:0_2px_10px_rgba(0,0,0,.65)] motion-reduce:animate-none">
          {win.beatPct !== null && win.beatPct > 0 && (
            <p className="mx-auto mb-3 max-w-[16rem] text-[15px] leading-snug text-white/80">
              Your win beats <span className="font-bold text-[#33D17A]">{win.beatPct}%</span> of wins on Kingz Bet this month.
            </p>
          )}
          <h2
            id="win-title"
            className="bg-[linear-gradient(180deg,#FFFFFF_30%,#FFE59A_70%,#F2B232)] bg-clip-text font-display text-[3.4rem] [text-shadow:none] font-black uppercase leading-[0.95] tracking-tight text-transparent drop-shadow-[0_4px_18px_rgba(255,196,64,.35)] sm:text-6xl"
          >
            You won!
          </h2>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.3em] text-[#33D17A]">Amount won</p>
          <p id="win-amount" className="mt-1 font-display text-[2.4rem] font-extrabold leading-none text-white tabular-nums sm:text-[2.75rem]">
            <span className="sr-only">GHS {amount}</span>
            <span aria-hidden>
              <span className="mr-1.5 text-2xl font-bold text-white/70">GHS</span>
              {shown}
            </span>
          </p>

          <div className="relative mx-auto mt-2 h-[19rem] w-[19rem] max-w-full" aria-hidden>
            <div className="absolute inset-0 animate-win-rays rounded-full bg-[repeating-conic-gradient(from_0deg,rgba(255,214,102,.20)_0deg_8deg,transparent_8deg_18deg)] [mask-image:radial-gradient(circle,black_25%,transparent_68%)] motion-reduce:animate-none" />
            <div className="kb-glow absolute inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,206,84,.55),rgba(255,170,30,.12)_55%,transparent_72%)]" />
            <Sparkles />
            <TrophyArt />
          </div>

          <p className="mt-1 text-sm text-white/70">
            Verify Code: <span className="select-all font-mono font-bold tracking-wider text-[#33D17A]">{win.verifyCode}</span>
          </p>
          <div className="mt-3 flex justify-center text-white">
            <Logo />
          </div>

          <div className="mt-7 space-y-3">
            <Link
              href={`/bets/${encodeURIComponent(win.ref)}`}
              onClick={onClose}
              className="btn h-14 w-full rounded-xl bg-[linear-gradient(135deg,#3BE38A,#16A34A)] text-base font-bold text-[#04210f] shadow-[0_10px_30px_-10px_rgba(51,209,122,.75)] hover:brightness-110"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
                <path d="M13 6v12" strokeDasharray="2 2" />
              </svg>
              View ticket details
            </Link>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onClose} className="btn h-12 rounded-xl border border-white/20 bg-white/[0.06] text-[15px] font-semibold text-white hover:bg-white/[0.12]">
                Close
              </button>
              <ShareTicket
                code={win.verifyCode}
                won
                amount={amount}
                className="btn h-12 w-full rounded-xl border border-[#FFD24D]/70 bg-[#FFD24D]/10 text-[15px] font-semibold text-[#FFE08A] hover:bg-[#FFD24D]/20"
              />
            </div>
          </div>
          {remaining > 0 && <p className="mt-4 text-xs text-white/60">+{remaining} more {remaining === 1 ? "win" : "wins"}</p>}
        </div>
      </div>
    </div>
  );
}

/** Original gold trophy: metallic bowl with scroll handles, a crown medallion, and a WELL DONE ribbon. */
function TrophyArt() {
  return (
    <svg viewBox="0 0 240 250" className="relative mx-auto h-full w-full animate-win-trophy drop-shadow-[0_18px_28px_rgba(0,0,0,.55)] motion-reduce:animate-none">
      <defs>
        {/* Horizontal bands read as a polished, curved metal surface. */}
        <linearGradient id="kb-metal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8A5400" />
          <stop offset=".16" stopColor="#E9A923" />
          <stop offset=".36" stopColor="#FFF1B5" />
          <stop offset=".5" stopColor="#FFD24D" />
          <stop offset=".78" stopColor="#C8860C" />
          <stop offset="1" stopColor="#7A4A00" />
        </linearGradient>
        <linearGradient id="kb-metal-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE8A0" />
          <stop offset=".5" stopColor="#E3A21C" />
          <stop offset="1" stopColor="#8F5A04" />
        </linearGradient>
        <linearGradient id="kb-handle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7C548" />
          <stop offset="1" stopColor="#9A6200" />
        </linearGradient>
        <radialGradient id="kb-inside" cx=".5" cy=".3" r=".8">
          <stop offset="0" stopColor="#7A4A00" />
          <stop offset="1" stopColor="#3D2400" />
        </radialGradient>
        <radialGradient id="kb-medal" cx=".35" cy=".3" r=".9">
          <stop offset="0" stopColor="#FFF6D6" />
          <stop offset=".55" stopColor="#F5C238" />
          <stop offset="1" stopColor="#A86A00" />
        </radialGradient>
        <linearGradient id="kb-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE38A" />
          <stop offset=".5" stopColor="#F2B232" />
          <stop offset="1" stopColor="#B87405" />
        </linearGradient>
        <clipPath id="kb-bowl">
          <path d="M62 44C62 112 88 140 120 146C152 140 178 112 178 44Z" />
        </clipPath>
      </defs>

      {/* handles */}
      <path d="M68 60C32 52 22 82 38 100c10 11 24 15 38 19" fill="none" stroke="url(#kb-handle)" strokeWidth="10" strokeLinecap="round" />
      <path d="M68 60C40 56 32 80 44 95" fill="none" stroke="#FFF1B5" strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
      <path d="M172 60c36-8 46 22 30 40-10 11-24 15-38 19" fill="none" stroke="url(#kb-handle)" strokeWidth="10" strokeLinecap="round" />
      <path d="M172 60c28-4 36 20 24 35" fill="none" stroke="#FFF1B5" strokeWidth="2.5" strokeLinecap="round" opacity=".35" />

      {/* bowl */}
      <path d="M62 44C62 112 88 140 120 146C152 140 178 112 178 44Z" fill="url(#kb-metal)" />
      <g clipPath="url(#kb-bowl)">
        <path d="M84 50c0 44 10 70 28 88" fill="none" stroke="#FFF8DD" strokeWidth="7" strokeLinecap="round" opacity=".35" />
        <rect className="kb-shine" x="0" y="20" width="34" height="150" fill="#FFFFFF" opacity=".28" />
      </g>
      {/* rim */}
      <ellipse cx="120" cy="44" rx="60" ry="11" fill="url(#kb-metal-v)" />
      <ellipse cx="120" cy="44" rx="53" ry="7.5" fill="url(#kb-inside)" />

      {/* crown medallion */}
      <circle cx="120" cy="90" r="25" fill="url(#kb-medal)" stroke="#FFF3C4" strokeWidth="2" />
      <circle cx="120" cy="90" r="19.5" fill="none" stroke="#9A6200" strokeWidth="1.2" opacity=".6" />
      <path d="M106 99l-3-17 9 7 8-12 8 12 9-7-3 17z" fill="#7A4A00" />
      <rect x="105.5" y="100" width="29" height="4" rx="1.5" fill="#7A4A00" />
      <circle cx="103" cy="81" r="2" fill="#7A4A00" />
      <circle cx="120" cy="76" r="2" fill="#7A4A00" />
      <circle cx="137" cy="81" r="2" fill="#7A4A00" />

      {/* stem */}
      <path d="M110 144h20l-3 14h-14z" fill="url(#kb-metal)" />
      <ellipse cx="120" cy="160" rx="15" ry="5" fill="url(#kb-metal-v)" />
      <path d="M113 163h14l5 22h-24z" fill="url(#kb-metal)" />

      {/* base */}
      <rect x="90" y="184" width="60" height="12" rx="3" fill="url(#kb-metal)" />
      <path d="M78 196h84l8 26H70z" fill="url(#kb-metal-v)" />

      {/* ribbon */}
      <path d="M62 206H34l10 12-10 12h30z" fill="#B87405" />
      <path d="M178 206h28l-10 12 10 12h-30z" fill="#B87405" />
      <path d="M56 200Q120 191 184 200L180 230Q120 222 60 230Z" fill="url(#kb-ribbon)" stroke="#FFF1B5" strokeWidth="1" />
      <text x="120" y="219.5" textAnchor="middle" fontFamily="inherit" fontSize="15" fontWeight="900" letterSpacing="1.6" fill="#3B2300">
        WELL DONE
      </text>
    </svg>
  );
}

/** Four-point sparkles around the trophy; fixed positions so it renders the same every time. */
function Sparkles() {
  const spots = [
    { l: "18%", t: "22%", s: 14, d: "0s" },
    { l: "80%", t: "18%", s: 18, d: ".6s" },
    { l: "86%", t: "52%", s: 11, d: "1.2s" },
    { l: "10%", t: "58%", s: 12, d: "1.7s" },
    { l: "62%", t: "8%", s: 9, d: ".3s" },
    { l: "30%", t: "6%", s: 10, d: "2s" },
  ];
  return (
    <>
      {spots.map((p, i) => (
        <svg key={i} viewBox="0 0 24 24" className="kb-twinkle absolute" style={{ left: p.l, top: p.t, width: p.s, height: p.s, animationDelay: p.d }}>
          <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill="#FFF3C4" />
        </svg>
      ))}
    </>
  );
}

/** Falling confetti; positions are fixed per piece so it renders the same every time. */
function Confetti() {
  const colors = ["#FFD24D", "#33D17A", "#FFFFFF", "#F2B232", "#3BE38A", "#FFE59A"];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-1.5 animate-win-confetti rounded-[1px]"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 7) * 0.35}s`,
            animationDuration: `${2.8 + (i % 5) * 0.5}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}
