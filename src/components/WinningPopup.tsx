"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { formatPesewas } from "@/lib/money";
import { Logo } from "./Logo";
import { ShareTicket } from "./ShareTicket";
import trophyArt from "../../public/img/trophy-win.png";

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
        window.dispatchEvent(new Event("sb:refresh")); // the header balance now includes the winnings
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
    window.addEventListener("sb:refresh", onFocus); // login, bets, wallet changes
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(onFocus, POLL_MS);
    return () => {
      window.removeEventListener("sb:refresh", onFocus);
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
              Your win beats <span className="font-bold text-teal">{win.beatPct}%</span> of wins on Bet Zone this month.
            </p>
          )}
          <h2
            id="win-title"
            className="bg-[linear-gradient(180deg,#FFFFFF_30%,#FFE59A_70%,#F2B232)] bg-clip-text font-display text-[3.4rem] [text-shadow:none] font-black uppercase leading-[0.95] tracking-tight text-transparent drop-shadow-[0_4px_18px_rgba(255,196,64,.35)] sm:text-6xl"
          >
            You won!
          </h2>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Amount won</p>
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
            Verify Code: <span className="select-all font-mono font-bold tracking-wider text-teal">{win.verifyCode}</span>
          </p>
          <div className="mt-3 flex justify-center text-white">
            <Logo />
          </div>

          <div className="mt-7 space-y-3">
            <Link
              href={`/bets/${encodeURIComponent(win.ref)}`}
              onClick={onClose}
              className="btn h-14 w-full rounded-xl bg-lime text-base font-bold text-lime-ink hover:bg-lime-600"
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

/** The gold trophy picture (supplied by the site owner, transparent background). */
function TrophyArt() {
  return (
    <Image
      src={trophyArt}
      alt=""
      priority
      sizes="304px"
      className="relative mx-auto h-full w-auto animate-win-trophy object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,.55)] motion-reduce:animate-none"
    />
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
  const colors = ["#F5C451", "#00BA3B", "#FFFFFF", "#E1AC35", "#8EF39E", "#FFE59A"]; // trophy gold with the brand greens and white
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
