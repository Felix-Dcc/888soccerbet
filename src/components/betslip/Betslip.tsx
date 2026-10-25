"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useBetslip, type Pick } from "./BetslipContext";
import { drawSlipImage } from "./slipImage";
import { combineMilliOdds, formatMilliOdds, formatPesewas, potentialPayout, toPesewas } from "@/lib/money";
import { formatStamp } from "@/lib/time";
import { newId } from "@/lib/clientId";

type Status =
  { k: "idle" } | { k: "placing" } | { k: "ok"; refs: string[] } | { k: "oddschanged"; placed?: string[] } | { k: "needlogin" } | { k: "error"; msg: string };

export function Betslip() {
  const { picks, stake, minStake, setStake, remove, clear, replace } = useBetslip();
  const [status, setStatus] = useState<Status>({ k: "idle" });
  const stakeId = useId(); // the slip renders twice (desktop rail + mobile drawer): ids must be unique
  const idemRef = useRef<string>(newId());
  // Singles: one idempotency key per leg, kept until that leg is placed, so a retry never doubles it.
  const singleKeys = useRef(new Map<string, string>());
  const [mode, setMode] = useState<"multiple" | "single">("multiple");
  const singles = mode === "single" && picks.length > 1;

  const combined = picks.length ? combineMilliOdds(picks.map((p) => p.milliOdds)) : 0;
  const stakeP = (() => {
    try {
      return toPesewas(stake || 0);
    } catch {
      return 0n;
    }
  })();
  const tooLow = stakeP < toPesewas(minStake); // the engine rejects it too; this just says so up front
  const payout = singles ? picks.reduce((sum, p) => sum + potentialPayout(stakeP, p.milliOdds), 0n) : picks.length ? potentialPayout(stakeP, combined) : 0n;
  const totalStake = singles ? stakeP * BigInt(picks.length) : stakeP;

  async function place(acceptOddsChange: boolean) {
    setStatus({ k: "placing" });
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idemRef.current,
          stakeGhs: Number(stake),
          acceptOddsChange,
          selections: picks.map((p) => ({
            selectionId: p.selectionId,
            expectedMilliOdds: p.milliOdds,
          })),
        }),
      });
      const data = await res.json();
      if (res.status === 201) {
        idemRef.current = newId();
        clear();
        setStatus({ k: "ok", refs: [data.bet.ref] });
        window.dispatchEvent(new Event("stakra:refresh"));
        return;
      }
      if (res.status === 401) return setStatus({ k: "needlogin" });
      if (data.code === "ODDS_CHANGED") {
        // Show the new price on the leg before the player accepts it.
        const { selectionId, now } = data.data as {
          selectionId: string;
          now: number;
        };
        replace(picks.map((p) => (p.selectionId === selectionId ? { ...p, milliOdds: now } : p)));
        return setStatus({ k: "oddschanged" });
      }
      setStatus({ k: "error", msg: data.error ?? "Could not place bet" });
    } catch {
      setStatus({ k: "error", msg: "Network error — try again" });
    }
  }

  /**
   * Singles: each leg is its own one-selection bet through the same endpoint and engine.
   * Legs are placed in order; on the first failure we stop, keep the unplaced legs on the
   * slip (with any new price shown) and report what did go through.
   */
  async function placeSingles(acceptOddsChange: boolean) {
    setStatus({ k: "placing" });
    const refs: string[] = [];
    const placed = new Set<string>();
    let next: Status = { k: "idle" };
    let changed: { selectionId: string; now: number } | null = null;
    for (const p of picks) {
      const key = singleKeys.current.get(p.selectionId) ?? newId();
      singleKeys.current.set(p.selectionId, key);
      try {
        const res = await fetch("/api/bets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: key,
            stakeGhs: Number(stake),
            acceptOddsChange,
            selections: [{ selectionId: p.selectionId, expectedMilliOdds: p.milliOdds }],
          }),
        });
        const data = await res.json();
        if (res.status === 201) {
          singleKeys.current.delete(p.selectionId);
          placed.add(p.selectionId);
          refs.push(data.bet.ref);
          continue;
        }
        if (res.status === 401) next = { k: "needlogin" };
        else if (data.code === "ODDS_CHANGED") {
          changed = data.data as { selectionId: string; now: number };
          next = { k: "oddschanged" };
        } else next = { k: "error", msg: data.error ?? "Could not place bet" };
      } catch {
        next = { k: "error", msg: "Network error — try again" };
      }
      break;
    }
    const left = picks.filter((p) => !placed.has(p.selectionId)).map((p) => (p.selectionId === changed?.selectionId ? { ...p, milliOdds: changed.now } : p));
    replace(left);
    if (refs.length) window.dispatchEvent(new Event("stakra:refresh"));
    if (next.k === "error" && refs.length)
      return setStatus({
        k: "error",
        msg: `${refs.length} placed (${refs.join(", ")}). ${next.msg}`,
      });
    if (next.k === "oddschanged") return setStatus({ k: "oddschanged", placed: refs });
    if (next.k !== "idle") return setStatus(next);
    setStatus({ k: "ok", refs });
  }

  return (
    <div className="card overflow-hidden">
      <>
        <div className="theme-dark flex items-center justify-between bg-[linear-gradient(180deg,#0B4A2A_0%,#083B21_100%)] px-4 py-3">
          <span className="flex items-center gap-2 font-display font-bold text-white">
            Betslip
            {picks.length > 0 && (
              <span key={picks.length} className="grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-gold px-1.5 text-xs font-bold text-black">
                {picks.length}
              </span>
            )}
          </span>
          {picks.length > 0 && (
            <button onClick={clear} className="text-sm font-semibold text-white/70 hover:text-white">
              Remove all
            </button>
          )}
        </div>

        {picks.length > 1 && (
          <div role="tablist" aria-label="Bet type" className="grid grid-cols-2 border-b border-line text-sm font-semibold">
            {(["single", "multiple"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setStatus({ k: "idle" });
                }}
                className={`relative py-2.5 capitalize transition ${mode === m ? "text-lime" : "text-fog hover:text-white"}`}
              >
                {m === "single" ? "Singles" : "Multiple"}
                {mode === m && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-lime" />}
              </button>
            ))}
          </div>
        )}

        {status.k === "ok" && (
          <Link href="/bets" className="m-4 flex justify-between gap-3 rounded-lg border border-win/40 bg-win/10 p-3 text-sm font-semibold text-win">
            <span>{status.refs.length > 1 ? `${status.refs.length} bets placed` : "Bet placed"}</span>
            <span className="truncate font-mono">{status.refs.join(", ")} →</span>
          </Link>
        )}

        <ul className="divide-y divide-white/[0.05]">
          {picks.map((p) => (
            <li key={p.selectionId} className="flex animate-fade-in items-start gap-3 px-4 py-3">
              <button
                onClick={() => remove(p.selectionId)}
                aria-label={`Remove ${p.selectionName}, ${p.fixtureName}`}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[10px] text-fog hover:bg-danger/20 hover:text-danger"
              >
                ✕
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{p.selectionName}</div>
                <div className="truncate text-xs text-fog">{p.marketName}</div>
                <div className="truncate text-xs text-fog-muted">{p.fixtureName}</div>
              </div>
              <span className="rounded-md bg-lime/10 px-2 py-1 text-sm font-bold tabular-nums text-lime">{formatMilliOdds(p.milliOdds)}</span>
            </li>
          ))}
        </ul>

        {picks.length > 0 && (
          <div className="border-t border-line p-4">
            {status.k === "oddschanged" && (
              <div role="status" className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-sm font-semibold text-warn">
                Odds changed
                {!!status.placed?.length && (
                  <span className="font-normal">
                    {" "}
                    · {status.placed.length} placed ({status.placed.join(", ")})
                  </span>
                )}
              </div>
            )}
            {status.k === "error" && (
              <div role="alert" className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger">
                {status.msg}
              </div>
            )}

            <label className="label" htmlFor={stakeId}>
              {singles ? "Stake per bet (GHS)" : "Stake (GHS)"}
            </label>
            <input
              id={stakeId}
              type="number"
              min={minStake}
              inputMode="decimal"
              aria-describedby={tooLow ? `${stakeId}-min` : undefined}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="input text-right font-bold"
            />
            <div className="mt-2 flex gap-2">
              {[50, 100, 250, 500].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake((stake || 0) + v)}
                  className="flex-1 rounded-lg border border-line py-1.5 text-xs font-semibold text-fog hover:border-lime hover:text-lime"
                >
                  +{v}
                </button>
              ))}
            </div>

            {tooLow && (
              <p id={`${stakeId}-min`} role="status" className="mt-2 text-xs font-semibold text-warn">
                Minimum stake is GHS {minStake}
                {singles ? " per bet" : ""}
              </p>
            )}

            <dl className="mt-4 space-y-1.5 text-sm">
              {singles ? (
                <div className="flex justify-between text-fog">
                  <dt>Total stake ({picks.length} bets)</dt>
                  <dd className="font-semibold tabular-nums text-white">GHS {formatPesewas(totalStake)}</dd>
                </div>
              ) : (
                <div className="flex justify-between text-fog">
                  <dt>Total odds</dt>
                  <dd className="font-semibold tabular-nums text-white">{formatMilliOdds(combined)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-white">
                <dt>{singles ? "Max return" : "Return"}</dt>
                <dd className="tabular-nums text-lime">GHS {formatPesewas(payout)}</dd>
              </div>
            </dl>

            {status.k === "needlogin" ? (
              <Link href="/login" className="btn-lime mt-4 w-full py-3">
                Log in to bet
              </Link>
            ) : (
              <button
                onClick={() => (singles ? placeSingles : place)(status.k === "oddschanged")}
                disabled={status.k === "placing" || tooLow}
                className="btn-lime mt-4 w-full py-3"
              >
                {status.k === "placing" ? "Placing…" : status.k === "oddschanged" ? "Accept & place" : singles ? `Place ${picks.length} bets` : "Place bet"}
              </button>
            )}
          </div>
        )}
      </>
      <Booking
        picks={picks}
        onLoad={(next) => {
          replace(next);
          setStatus({ k: "idle" });
        }}
      />
    </div>
  );
}

type Booked = { code: string; image: File | null; at: Date };
type BookingState = { k: "idle" } | { k: "busy" } | { k: "loaded"; skipped: number } | { k: "error"; msg: string };

/**
 * Booking codes, laid out like the major books: an empty slip invites you to load a code;
 * a slip with picks offers a "Book Bet" link that opens the booking pop-up.
 */
function Booking({ picks, onLoad }: { picks: Pick[]; onLoad: (picks: Pick[]) => void }) {
  const { notice, setNotice } = useBetslip();
  const [state, setState] = useState<BookingState>({ k: "idle" });
  const [booked, setBooked] = useState<Booked | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const codeId = useId();
  const ids = picks.map((p) => p.selectionId).join(",");

  // A code describes one exact slip; drop it as soon as the slip changes.
  useEffect(() => {
    setBooked(null);
    setOpen(false);
  }, [ids]);

  async function book() {
    setState({ k: "busy" });
    setNotice(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectionIds: picks.map((p) => p.selectionId) }),
      });
      const d = await res.json();
      if (res.status !== 201) return setState({ k: "error", msg: d.error ?? "Could not book" });
      const at = new Date();
      const image = await drawSlipImage(d.code, picks, at)
        .then((b) => new File([b], `kingzbet-${d.code}.png`, { type: "image/png" }))
        .catch(() => null); // the code is still usable without the picture
      setBooked({ code: d.code, image, at });
      setOpen(true);
      setState({ k: "idle" });
    } catch {
      setState({ k: "error", msg: "Network error — try again" });
    }
  }

  async function load(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setState({ k: "busy" });
    setNotice(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(code.trim())}`);
      const d = await res.json();
      if (!res.ok) return setState({ k: "error", msg: d.error ?? "Could not load code" });
      if (d.picks.length === 0)
        return setState({
          k: "error",
          msg: "None of these selections are available any more",
        });
      onLoad(d.picks);
      setCode("");
      setState({ k: "loaded", skipped: d.unavailable });
    } catch {
      setState({ k: "error", msg: "Network error — try again" });
    }
  }

  const error = state.k === "error" ? state.msg : notice;
  const messages = (
    <>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {state.k === "loaded" && state.skipped > 0 && (
        <p role="status" className="text-sm text-warn">
          {state.skipped} {state.skipped === 1 ? "selection is" : "selections are"} no longer available
        </p>
      )}
    </>
  );

  if (picks.length > 0)
    return (
      <div className="space-y-2 px-4 pb-4">
        <div className="flex items-center justify-between text-sm font-semibold">
          {booked ? (
            <button onClick={() => setOpen(true)} className="text-lime hover:underline">
              Booked: <span className="font-mono tracking-wider">{booked.code}</span>
            </button>
          ) : (
            <button onClick={book} disabled={state.k === "busy"} className="text-lime hover:underline disabled:opacity-50">
              {state.k === "busy" ? "Booking…" : "Book Bet"}
            </button>
          )}
        </div>
        {messages}
        {open && booked && createPortal(<BookingDialog booked={booked} onClose={() => setOpen(false)} />, document.body)}
      </div>
    );

  return (
    <form onSubmit={load} className="space-y-3 p-4">
      <label htmlFor={codeId} className="block text-sm text-fog">
        To place a bet, click on the odds. Or insert a booking code
      </label>
      <input
        id={codeId}
        data-booking-code
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={20}
        placeholder="Booking Code"
        className="input py-2.5 font-mono uppercase placeholder:font-sans placeholder:normal-case"
      />
      <button
        disabled={state.k === "busy" || !code.trim()}
        className="btn-lime w-full py-2.5 text-sm disabled:bg-ink-500 disabled:text-fog-muted disabled:opacity-100 disabled:shadow-none"
      >
        {state.k === "busy" ? "Loading…" : "Load"}
      </button>
      {messages}
    </form>
  );
}

/** Booking pop-up: code with copy, booking time, the slip picture (tap to enlarge), share row. */
function BookingDialog({ booked, onClose }: { booked: Booked; onClose: () => void }) {
  const { code, image, at } = booked;
  const closeRef = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [saved, setSaved] = useState(false);
  const link = `${window.location.origin}/?booking=${encodeURIComponent(code)}`;
  const canShareFile = !!image && !!navigator.canShare?.({ files: [image] });
  // iOS only puts images in Photos via the share sheet ("Save Image"); elsewhere a download
  // lands in the gallery's Downloads album.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  useEffect(() => {
    if (!image) return;
    const u = URL.createObjectURL(image);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    closeRef.current?.focus();
    // Capture phase + stop: Escape closes the enlarged picture first, then this pop-up — never
    // the betslip drawer underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (zoomRef.current) setZoom(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function copy(text: string, what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked (insecure context): the code stays on screen to copy by hand */
    }
  }
  function save() {
    if (!image || !url) return;
    if (ios && canShareFile) return void navigator.share({ files: [image], title: `Kingz Bet booking ${code}` }).catch(() => {});
    const a = document.createElement("a");
    a.href = url;
    a.download = image.name;
    a.click();
    setSaved(true);
  }

  const text = `Kingz Bet booking code ${code}`;
  const shareBtn = "flex flex-col items-center gap-1.5 text-xs font-medium text-fog hover:text-white";
  const shareIcon = "grid h-11 w-11 place-items-center rounded-full";

  return (
    <div role="dialog" aria-modal="true" aria-label={`Booking code ${code}`} className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-fade-in rounded-2xl bg-ink-700 px-6 pb-6 pt-8 text-center shadow-lift">
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-xl text-fog hover:bg-white/[0.06] hover:text-white"
        >
          ✕
        </button>
        <p className="text-sm font-semibold text-fog">Booking Code</p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="font-display text-4xl font-extrabold tracking-wide text-white">{code}</span>
          <button
            onClick={() => copy(code, "code")}
            aria-label="Copy booking code"
            className="grid h-9 w-9 place-items-center rounded-lg text-fog hover:bg-white/[0.06] hover:text-white"
          >
            {copied === "code" ? (
              <span className="text-xs font-bold text-lime">✓</span>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1 text-xs tabular-nums text-fog-muted">{formatStamp(at)}</p>

        {url && (
          <button
            onClick={() => setZoom(true)}
            aria-label="Enlarge slip picture"
            className="group relative mx-auto mt-5 block overflow-hidden rounded-md border border-line shadow-card"
          >
            <img src={url} alt="" className="h-32 w-auto" />
            <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/20">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-snow">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="11" cy="11" r="6" />
                  <path d="m20 20-4.5-4.5M11 8v6M8 11h6" />
                </svg>
              </span>
            </span>
          </button>
        )}

        <div className="mt-6 flex justify-center gap-5">
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={shareBtn}
          >
            <span className={`${shareIcon} bg-black text-snow`}>
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
                <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" />
              </svg>
            </span>
            X
          </a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" className={shareBtn}>
            <span className={`${shareIcon} bg-[#1877F2] text-snow`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4A21 21 0 0 0 14.3 4c-2.3 0-3.8 1.4-3.8 3.9v2.6H8v3h2.5V21z" />
              </svg>
            </span>
            Facebook
          </a>
          <button onClick={() => copy(link, "link")} className={shareBtn}>
            <span className={`${shareIcon} bg-ink-500 text-white`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
              </svg>
            </span>
            {copied === "link" ? "Copied" : "Copy Link"}
          </button>
          {image && (
            <button onClick={save} className={shareBtn}>
              <span className={`${shareIcon} bg-ink-500 text-white`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
                </svg>
              </span>
              {saved ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </div>

      {zoom && url && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4" onClick={() => setZoom(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <img
            src={url}
            alt={`Booking code ${code} with its selections`}
            className="relative max-h-full w-auto max-w-full rounded-lg shadow-lift sm:max-w-sm"
          />
        </div>
      )}
    </div>
  );
}
