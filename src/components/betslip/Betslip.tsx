"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useBetslip, type Pick } from "./BetslipContext";
import { drawSlipImage } from "./slipImage";
import { combineMilliOdds, formatMilliOdds, formatPesewas, potentialPayout, toPesewas } from "@/lib/money";
import { multipleBonus } from "@/lib/bonus";
import { newId } from "@/lib/clientId";
import { Logo } from "../Logo";

type Status =
  { k: "idle" } | { k: "placing" } | { k: "ok"; refs: string[] } | { k: "oddschanged"; placed?: string[] } | { k: "needlogin" } | { k: "error"; msg: string };

/** `bare` drops the card chrome and title, for when the rail's tab bar is already the header. */
export function Betslip({ bare = false }: { bare?: boolean } = {}) {
  const { picks, stake, minStake, bonus, setStake, remove, clear, replace } = useBetslip();
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
  const paused = picks.some((p) => p.suspended); // a live match repricing after a goal: back in seconds
  const payout = singles ? picks.reduce((sum, p) => sum + potentialPayout(stakeP, p.milliOdds), 0n) : picks.length ? potentialPayout(stakeP, combined) : 0n;
  const totalStake = singles ? stakeP * BigInt(picks.length) : stakeP;
  // Only a multiple that lands in full earns the bonus, so singles never show one.
  const maxBonus = singles ? 0n : multipleBonus(payout, picks.map((p) => p.milliOdds), bonus);

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
        window.dispatchEvent(new Event("sb:refresh"));
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
    if (refs.length) window.dispatchEvent(new Event("sb:refresh"));
    if (next.k === "error" && refs.length)
      return setStatus({
        k: "error",
        msg: `${refs.length} placed (${refs.join(", ")}). ${next.msg}`,
      });
    if (next.k === "oddschanged") return setStatus({ k: "oddschanged", placed: refs });
    if (next.k !== "idle") return setStatus(next);
    setStatus({ k: "ok", refs });
  }

  // Quick stakes start at the minimum the engine accepts, so every chip is a valid stake.
  const quickStakes = [minStake, minStake * 2, minStake * 4, minStake * 8];

  return (
    <div className={bare ? "" : "card overflow-hidden"}>
      <>
        {!bare && (
          <div className="theme-dark flex items-center justify-between border-b border-line bg-ink-800 px-4 py-3">
            <span className="flex items-center gap-2 font-display font-bold text-white">
              Betslip
              {picks.length > 0 && (
                <span key={picks.length} className="grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-gold px-1.5 text-xs font-bold text-gold-ink">
                  {picks.length}
                </span>
              )}
            </span>
          </div>
        )}

        {status.k === "ok" && (
          <Link href="/bets" className="m-3 flex items-center justify-between gap-3 rounded-xl border border-win/40 bg-win/10 p-3 text-sm font-semibold text-win">
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12l5 5L20 7" />
              </svg>
              {status.refs.length > 1 ? `${status.refs.length} bets placed` : "Bet placed"}
            </span>
            <span className="truncate font-mono">{status.refs.join(", ")} →</span>
          </Link>
        )}

        {picks.length > 0 && (
          <div className="flex items-center gap-2 px-3 pt-3">
            {picks.length > 1 ? (
              <div role="tablist" aria-label="Bet type" className="grid flex-1 grid-cols-2 rounded-lg bg-ink-800 p-1 text-sm font-semibold">
                {(["single", "multiple"] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setStatus({ k: "idle" });
                    }}
                    className={`rounded-md py-1.5 transition ${mode === m ? "bg-lime text-lime-ink shadow-card" : "text-fog hover:text-white"}`}
                  >
                    {m === "single" ? "Singles" : `Multiple (${picks.length})`}
                  </button>
                ))}
              </div>
            ) : (
              <span className="flex-1 text-sm font-semibold text-white">Single</span>
            )}
            <button onClick={clear} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-fog transition-colors hover:bg-danger/10 hover:text-danger">
              Clear all
            </button>
          </div>
        )}

        <ul className="space-y-2 p-3">
          {picks.map((p) => {
            const pick = pickLabel(p);
            return (
              <li key={p.selectionId} className="relative animate-fade-in rounded-xl border border-line bg-ink-800 p-3 pr-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {pick.tag && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded bg-lime/15 px-1.5 text-[11px] font-extrabold text-lime">{pick.tag}</span>}
                      {pick.name && <span className="truncate text-sm font-bold text-white">{pick.name}</span>}
                    </div>
                    <div className="mt-1 truncate text-xs text-fog">{p.marketName}</div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fog-muted">
                      {p.score && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-danger">
                          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                          Live
                          <span className="tabular-nums text-white">
                            {p.score.home}–{p.score.away}
                          </span>
                        </span>
                      )}
                      <span className="truncate">{p.fixtureName}</span>
                    </div>
                    {p.suspended && <div className="mt-1 text-[11px] font-semibold text-warn">Suspended — odds updating after a goal</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      onClick={() => remove(p.selectionId)}
                      aria-label={`Remove ${p.selectionName}, ${p.fixtureName}`}
                      className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-fog transition-colors hover:bg-danger/15 hover:text-danger"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                    <span className={`rounded-lg bg-gold/15 px-2.5 py-1 text-sm font-extrabold tabular-nums text-gold ${p.suspended ? "opacity-40 line-through" : ""}`}>{formatMilliOdds(p.milliOdds)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {picks.length > 0 && (
          <div className="space-y-3 border-t border-line p-3">
            {status.k === "oddschanged" && (
              <div role="status" className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-sm font-semibold text-warn">
                Odds changed — check the new price{status.placed?.length ? "s" : ""} above
                {!!status.placed?.length && (
                  <span className="font-normal">
                    {" "}
                    · {status.placed.length} placed ({status.placed.join(", ")})
                  </span>
                )}
              </div>
            )}
            {status.k === "error" && (
              <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger">
                {status.msg}
              </div>
            )}

            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-fog" htmlFor={stakeId}>
                {singles ? "Stake per bet" : "Stake"}
                <span className="font-normal text-fog-muted">Min GHS {minStake}</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-fog">GHS</span>
                <input
                  id={stakeId}
                  type="number"
                  min={minStake}
                  inputMode="decimal"
                  aria-describedby={tooLow ? `${stakeId}-min` : undefined}
                  value={stake || ""} // cleared to 0 shows an empty box, not a stray "0" to delete around
                  onChange={(e) => setStake(Number(e.target.value))}
                  className="input pl-12 text-right text-lg font-extrabold tabular-nums"
                />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {quickStakes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStake(s)}
                    aria-pressed={Number(stake) === s}
                    className={`rounded-lg border py-1.5 text-xs font-bold tabular-nums transition-colors ${
                      Number(stake) === s ? "border-lime bg-lime/15 text-lime" : "border-line bg-ink-800 text-fog hover:border-ink-400 hover:text-white"
                    }`}
                  >
                    {s.toLocaleString("en-GB")}
                  </button>
                ))}
              </div>
              {tooLow && (
                <p id={`${stakeId}-min`} role="status" className="mt-2 text-xs font-semibold text-warn">
                  Minimum stake is GHS {minStake}{singles ? " per bet" : ""}. Top up GHS {Math.max(0, Math.round((minStake - (Number(stake) || 0)) * 100) / 100)} to place the bet.
                </p>
              )}
            </div>

            <dl className="space-y-1.5 rounded-xl bg-ink-800 p-3 text-sm">
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
              {maxBonus > 0n && (
                <div className="flex justify-between text-fog">
                  <dt>Max bonus</dt>
                  <dd className="font-semibold tabular-nums text-gold">+ GHS {formatPesewas(maxBonus)}</dd>
                </div>
              )}
              <div className="flex items-end justify-between border-t border-line pt-2">
                <dt className="text-sm font-semibold text-white">{singles ? "Max potential win" : "Potential win"}</dt>
                <dd className="font-display text-xl font-extrabold tabular-nums text-gold">GHS {formatPesewas(payout + maxBonus)}</dd>
              </div>
            </dl>

            {status.k === "needlogin" ? (
              <Link href="/login" className="btn-lime w-full py-3.5 text-base">
                Log in to bet
              </Link>
            ) : (
              <button
                onClick={() => (singles ? placeSingles : place)(status.k === "oddschanged")}
                disabled={status.k === "placing" || tooLow || paused}
                className="btn-lime w-full py-3.5 text-base"
              >
                {paused ? "Waiting for live odds…" : status.k === "placing" ? "Placing…" : status.k === "oddschanged" ? "Accept & place" : singles ? `Place ${picks.length} bets` : "Place bet"}
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

/** "Home"/"Away" on a match result read as the team's name, tagged Home/Away; a draw is just the Draw tag. Other markets keep their own wording. */
function pickLabel(p: Pick): { name: string; tag: string | null } {
  const teams = p.fixtureName.split(" v ");
  if (teams.length === 2) {
    if (p.selectionName === "Home") return { name: teams[0]!, tag: "Home" };
    if (p.selectionName === "Away") return { name: teams[1]!, tag: "Away" };
    if (p.selectionName === "Draw") return { name: "", tag: "Draw" };
  }
  return { name: p.selectionName, tag: null };
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
        .then((b) => new File([b], `betzone-${d.code}.png`, { type: "image/png" }))
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
      <div className="space-y-2 px-3 pb-3">
        {booked ? (
          <button onClick={() => setOpen(true)} className="btn-ghost w-full py-2.5 text-sm">
            Booked: <span className="font-mono tracking-wider text-white">{booked.code}</span>
          </button>
        ) : (
          <button onClick={book} disabled={state.k === "busy"} className="btn-ghost w-full py-2.5 text-sm">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 3h12v18l-6-4-6 4z" />
            </svg>
            {state.k === "busy" ? "Booking…" : "Book bet · share code"}
          </button>
        )}
        {messages}
        {open && booked && createPortal(<BookingDialog booked={booked} picks={picks} onClose={() => setOpen(false)} />, document.body)}
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
        maxLength={6}
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

/**
 * Booking pop-up, laid out like a printed betslip: brand header with the country and booking
 * time, the code as the hero with the total odds, an example bet at GHS 100 with the real
 * multiple bonus, every selection, then the ways to share it. A sheet on phones, a card above.
 */
function BookingDialog({ booked, picks, onClose }: { booked: Booked; picks: Pick[]; onClose: () => void }) {
  const { code, image, at } = booked;
  const { bonus, siteUrl } = useBetslip();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [saved, setSaved] = useState(false);
  const link = `${siteUrl}/?booking=${encodeURIComponent(code)}`;
  const text = `Bet Zone booking code ${code}`;
  const canShare = typeof navigator.share === "function";
  const canShareFile = !!image && !!navigator.canShare?.({ files: [image] });
  // iOS only puts images in Photos via the share sheet ("Save Image"); elsewhere a download
  // lands in the gallery's Downloads album.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const combined = combineMilliOdds(picks.map((p) => p.milliOdds));
  const win = potentialPayout(EXAMPLE_STAKE, combined);
  const extra = multipleBonus(win, picks.map((p) => p.milliOdds), bonus);

  useEffect(() => {
    if (!image) return;
    const u = URL.createObjectURL(image);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);

  useEffect(() => {
    closeRef.current?.focus();
    // Capture phase + stop: Escape closes this pop-up, never the betslip drawer underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function copy(value: string, what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked (insecure context): the code stays on screen to copy by hand */
    }
  }
  function shareInApp() {
    if (canShare) void navigator.share({ title: text, text, url: link }).catch(() => {});
    else void copy(link, "link");
  }
  function save() {
    if (!image || !url) return;
    if (ios && canShareFile) return void navigator.share({ files: [image], title: text }).catch(() => {});
    const a = document.createElement("a");
    a.href = url;
    a.download = image.name;
    a.click();
    setSaved(true);
  }

  const shareBtn = "flex flex-col items-center gap-1.5 text-center text-[11px] font-medium leading-tight text-fog transition-colors hover:text-white disabled:opacity-40";
  const shareIcon = "grid h-11 w-11 place-items-center rounded-full bg-ink-500 text-white transition-transform hover:scale-105";
  const row = "flex items-center justify-between gap-3 tabular-nums";

  return (
    <div role="dialog" aria-modal="true" aria-label={`Booking code ${code}`} className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-md animate-fade-in flex-col overflow-hidden rounded-t-2xl border border-line bg-ink-800 text-white shadow-lift sm:rounded-2xl">
        {/* brand header: logo, country, and when it was booked (follows the light/dark theme) */}
        <div className="flex items-center gap-3 border-b border-line bg-ink-700 py-3 pl-4 pr-2">
          <Logo size="sm" />
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-white">
            <GhanaFlag />
            Ghana
          </span>
          <span className="ml-auto text-right text-xs leading-snug text-fog">
            Betslip
            <span className="block tabular-nums">{slipTime(at)}</span>
          </span>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg text-fog hover:bg-ink-600 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* the code and the total odds */}
          <div className="px-6 pb-5 pt-5 text-center">
            <p className="text-sm text-fog">Booking Code</p>
            <button
              onClick={() => copy(code, "code")}
              aria-label={`Booking code ${code}, copy`}
              className="mt-1 select-all font-display text-[44px] font-extrabold leading-none tracking-[0.06em] text-lime"
            >
              {code}
            </button>
            <p aria-live="polite" className="mt-1 h-4 text-[11px] text-fog-muted">
              {copied === "code" ? "Code copied" : "Tap the code to copy it"}
            </p>
            <div className="mx-auto mt-3 flex max-w-[16rem] items-center justify-between rounded-lg bg-ink-600 px-4 py-3">
              <span className="text-sm text-fog">Odds</span>
              <span className="text-xl font-extrabold tabular-nums text-white">{formatMilliOdds(combined)}</span>
            </div>
          </div>

          {/* an example bet at the slip's real odds and bonus */}
          <div className="mx-4">
            <p className="bg-ink-600 px-2 py-1.5 text-sm text-white">Example Bet</p>
            <dl className="space-y-1.5 bg-ink-700 px-5 py-3 text-sm text-white">
              <div className={row}>
                <dt>Stake</dt>
                <dd>{formatPesewas(EXAMPLE_STAKE)}</dd>
              </div>
              <div className={row}>
                <dt>Bonus</dt>
                <dd>{formatPesewas(extra)}</dd>
              </div>
              <div className={row}>
                <dt>Payout</dt>
                <dd>{formatPesewas(win + extra)}</dd>
              </div>
            </dl>

            <p className="mt-px bg-ink-600 px-2 py-1.5 text-sm text-white">Selections</p>
            <ul className="divide-y divide-line bg-ink-700">
              {picks.map((p) => {
                const pick = pickLabel(p);
                return (
                  <li key={p.selectionId} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-white">
                        <BallIcon />
                        <span className="break-words">{pick.tag ?? pick.name}</span>
                      </span>
                      <span className="shrink-0 text-[15px] font-bold tabular-nums text-white">{formatMilliOdds(p.milliOdds)}</span>
                    </div>
                    <p className="mt-0.5 break-words text-sm text-fog">{p.fixtureName.replace(" v ", " vs ")}</p>
                    <p className="break-words text-sm text-fog">{p.marketName}</p>
                  </li>
                );
              })}
            </ul>
          </div>

          <a href={siteUrl} className="mx-auto my-4 block w-fit rounded-full bg-lime/15 px-6 py-1.5 text-sm font-semibold text-lime">
            {siteUrl.replace(/^https?:\/\//, "")}
          </a>
        </div>

        {/* ways to share */}
        <div className="grid grid-cols-5 gap-1 border-t border-line bg-ink-700 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" className={shareBtn}>
            <span className={shareIcon}>
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
                <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" />
              </svg>
            </span>
            X / Twitter
          </a>
          <a href={`https://wa.me/?text=${encodeURIComponent(`${text}: ${link}`)}`} target="_blank" rel="noopener noreferrer" className={shareBtn}>
            <span className={shareIcon}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z" />
              </svg>
            </span>
            Whatsapp
          </a>
          <button onClick={shareInApp} className={shareBtn}>
            <span className={shareIcon}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" />
              </svg>
            </span>
            Share In App
          </button>
          <button onClick={() => copy(link, "link")} className={shareBtn}>
            <span className={shareIcon}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
              </svg>
            </span>
            {copied === "link" ? "Copied" : "Copy Link"}
          </button>
          <button onClick={save} disabled={!image} className={shareBtn}>
            <span className={shareIcon}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
            </span>
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const EXAMPLE_STAKE = 10_000n; // GHS 100, the same example the saved slip picture uses
/** "11/11/2026 01:58" in Ghana time. */
const slipTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(d)
    .replace(",", "");

function GhanaFlag() {
  return (
    <svg viewBox="0 0 30 20" className="h-4 w-6 rounded-sm" aria-hidden>
      <rect width="30" height="20" fill="#006B3F" />
      <rect width="30" height="13.33" fill="#FCD116" />
      <rect width="30" height="6.67" fill="#CE1126" />
      <path fill="#000" d="m15 6.9.75 2.3h2.42l-1.96 1.42.75 2.3L15 11.5l-1.96 1.42.75-2.3-1.96-1.42h2.42z" />
    </svg>
  );
}

function BallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#fff" stroke="#0C1421" strokeWidth="1.2" />
      <path fill="#0C1421" d="m12 8 3.8 2.8-1.5 4.5H9.7l-1.5-4.5z" />
      <path stroke="#0C1421" strokeWidth="1.2" d="M12 8V2.6M15.8 10.8l5.2-1.7M14.3 15.3l3.2 4.4M9.7 15.3l-3.2 4.4M8.2 10.8 3 9.1" />
    </svg>
  );
}
