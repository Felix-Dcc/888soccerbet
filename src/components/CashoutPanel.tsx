"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPesewas, toPesewas } from "@/lib/money";
import { newId } from "@/lib/clientId";

export interface CashoutQuote {
  available: boolean;
  offer?: string; // pesewas
  reason?: string;
}
interface AutoRule {
  target: string; // pesewas
  above: boolean;
}

const MIN = 100n; // GHS 1.00, as the server enforces
const ghs = (p: bigint | string) => `GHS ${formatPesewas(BigInt(p))}`;

async function send(url: string, body?: object, method = "POST") {
  try {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { ok: r.ok, d: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, d: { error: "Network error — try again" } };
  }
}

const gold = "btn h-11 w-full bg-gold text-sm font-bold text-gold-ink hover:bg-gold-600";
const ghost = "btn h-11 border border-line text-sm text-white hover:bg-ink-600";

/**
 * Cash out button, the same at the foot of a slip on My Bets and on the open slip: one gold
 * "Cash out GHS X"; tapping asks to confirm. With `options` (the open slip) the confirm step also
 * offers a partial cash out and an auto cash out rule. Prices come from the server; if the value
 * moved since the page loaded the server refuses and the new value is shown to confirm again.
 */
export function CashoutPanel({
  betRef,
  quote,
  auto,
  partialsLeft,
  options = false,
}: {
  betRef: string;
  quote: CashoutQuote;
  auto: AutoRule | null;
  partialsLeft: number;
  options?: boolean;
}) {
  const router = useRouter();
  const [offer, setOffer] = useState<bigint | null>(quote.available && quote.offer ? BigInt(quote.offer) : null);
  const [mode, setMode] = useState<"idle" | "confirm" | "partial" | "auto">("idle");
  const [part, setPart] = useState<bigint>(0n);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newId()); // one key per attempt: a retried tap can't cash out twice

  // A refreshed page brings a new server quote.
  useEffect(() => setOffer(quote.available && quote.offer ? BigInt(quote.offer) : null), [quote.available, quote.offer]);

  const base = `/api/bets/${encodeURIComponent(betRef)}`;
  const maxPart = offer !== null ? offer - MIN : 0n;
  const canPartial = offer !== null && partialsLeft > 0 && maxPart >= MIN;

  async function cashOut(amount?: bigint) {
    if (offer === null) return;
    setBusy(true);
    setMsg(null);
    const { ok, d } = await send(`${base}/cashout`, { expectedPesewas: offer.toString(), amountPesewas: amount?.toString(), idempotencyKey: key.current });
    setBusy(false);
    if (ok) {
      key.current = newId();
      setMode("idle");
      setMsg({ ok: true, text: `Cashed out ${ghs(d.cashout.amount)}` });
      window.dispatchEvent(new Event("sb:refresh")); // header balance
      router.refresh();
      return;
    }
    if (d.code === "OFFER_CHANGED" && d.data?.offer) {
      key.current = newId();
      setOffer(BigInt(d.data.offer));
      setMode("confirm");
      setMsg({ ok: false, text: `The value changed to ${ghs(d.data.offer)}. Confirm again to cash out.` });
      return;
    }
    if (d.code === "UNAVAILABLE") setOffer(null);
    setMsg({ ok: false, text: d.error ?? "Cash out failed" });
  }

  async function saveAuto() {
    let p: bigint;
    try {
      p = toPesewas(target);
    } catch {
      return setMsg({ ok: false, text: "Enter an amount, e.g. 150" });
    }
    setBusy(true);
    const { ok, d } = await send(`${base}/auto-cashout`, { targetPesewas: p.toString() });
    setBusy(false);
    setMsg({ ok, text: ok ? `Auto cash out set at ${ghs(p)}` : (d.error ?? "Couldn't set auto cash out") });
    if (ok) {
      setMode("idle");
      router.refresh();
    }
  }

  async function removeAuto() {
    setBusy(true);
    const { ok, d } = await send(`${base}/auto-cashout`, undefined, "DELETE");
    setBusy(false);
    setMsg({ ok, text: ok ? "Auto cash out removed" : (d.error ?? "Couldn't remove it") });
    if (ok) router.refresh();
  }

  const note = msg && (
    <p role="status" className={`mt-2 text-center text-sm font-medium ${msg.ok ? "text-lime" : "text-warn"}`}>
      {msg.text}
    </p>
  );

  if (offer === null)
    return (
      <div>
        <button type="button" disabled className="btn h-11 w-full border border-line bg-ink-600 text-sm text-fog">
          {quote.reason ? `Cash out · ${quote.reason}` : "Cash out unavailable"}
        </button>
        {note}
      </div>
    );

  return (
    <div>
      {mode === "idle" && (
        <button type="button" onClick={() => setMode("confirm")} className={gold}>
          Cash out {ghs(offer)}
        </button>
      )}

      {mode === "confirm" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("idle")} className={ghost}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => cashOut()} className={gold}>
              {busy ? "Cashing out…" : `Confirm ${ghs(offer)}`}
            </button>
          </div>
          {options && (
            <div className="flex justify-center gap-5 pt-1 text-sm font-semibold">
              <button
                type="button"
                disabled={!canPartial}
                onClick={() => {
                  setPart(offer / 2n >= MIN && offer / 2n <= maxPart ? offer / 2n : MIN);
                  setMode("partial");
                }}
                className="text-lime underline-offset-2 hover:underline disabled:text-fog-muted disabled:no-underline"
              >
                Partial cash out
              </button>
              <button type="button" onClick={() => setMode("auto")} className="text-lime underline-offset-2 hover:underline">
                {auto ? "Change auto cash out" : "Auto cash out"}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "partial" && canPartial && (
        <div className="space-y-2">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-ink-600 px-3 py-2">
              <dt className="text-xs text-fog">Cash out now</dt>
              <dd className="font-bold tabular-nums text-white">{ghs(part)}</dd>
            </div>
            <div className="rounded-lg bg-ink-600 px-3 py-2 text-right">
              <dt className="text-xs text-fog">Keep running</dt>
              <dd className="font-bold tabular-nums text-white">{ghs(offer - part)}</dd>
            </div>
          </dl>
          <input
            aria-label="Amount to cash out now"
            type="range"
            min={Number(MIN)}
            max={Number(maxPart)}
            step={1}
            value={Number(part)}
            onChange={(e) => setPart(BigInt(e.target.value))}
            className="w-full accent-[rgb(var(--lime))]"
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("confirm")} className={ghost}>
              Back
            </button>
            <button type="button" disabled={busy} onClick={() => cashOut(part)} className={gold}>
              {busy ? "Cashing out…" : `Cash out ${ghs(part)}`}
            </button>
          </div>
        </div>
      )}

      {mode === "auto" && (
        <div className="space-y-2">
          <label htmlFor={`auto-${betRef}`} className="block text-sm text-fog">
            Auto cash out at (GHS)
          </label>
          <input
            id={`auto-${betRef}`}
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={formatPesewas((offer * 12n) / 10n).replace(/,/g, "")}
            className="input w-full"
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("confirm")} className={ghost}>
              Back
            </button>
            <button type="button" disabled={busy || !target} onClick={saveAuto} className="btn-lime h-11 text-sm">
              Set auto cash out
            </button>
          </div>
        </div>
      )}

      {options && auto && mode === "idle" && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-ink-600 px-3 py-2 text-xs text-fog">
          <span>
            Auto cash out when value {auto.above ? "rises to" : "falls to"} <b className="tabular-nums text-white">{ghs(auto.target)}</b>
          </span>
          <button type="button" disabled={busy} onClick={removeAuto} className="font-semibold underline hover:text-white">
            Remove
          </button>
        </div>
      )}
      {note}
    </div>
  );
}
