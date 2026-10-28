"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { newId } from "@/lib/clientId";
import { formatPesewas } from "@/lib/money";
import { FLASH_KEY } from "@/components/FlashNotice";
import { NETWORKS, guessNetwork, type Network } from "@/lib/providers/payments/types";

const NETWORK_LABEL: Record<Network, string> = { MTN: "MTN MoMo", TELECEL: "Telecel Cash", AIRTELTIGO: "AirtelTigo Money" };

type Mode = "deposit" | "withdraw";
interface Verification {
  required: boolean; // only after a win paying out over GHS 1000
  paid: number; // verification payments held so far
  needed: number;
  perPaymentGhs: number;
  heldGhs: number;
  status: string; // User.kycStatus: UNVERIFIED | PENDING (awaiting review) | VERIFIED | REJECTED
}

export function WalletPanel({ minDepositGhs, isAdmin = false, verification }: { minDepositGhs: number; isAdmin?: boolean; verification: Verification }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("deposit");
  const depositStart = isAdmin ? 0 : minDepositGhs; // admins start the deposit box empty; players keep the default
  const [amount, setAmount] = useState(depositStart);
  const verified = verification.status === "VERIFIED";
  const locked = mode === "withdraw" && verification.required && !verified;
  // Hidden until a big win makes it apply (or money is already held for review).
  const showVerification = verification.required || verification.heldGhs > 0;
  const [msisdn, setMsisdn] = useState("");
  const [accountName, setAccountName] = useState(""); // withdrawals only: the name an admin pays by hand
  const [network, setNetwork] = useState<Network>("MTN");
  const [networkPicked, setNetworkPicked] = useState(false); // once chosen by hand, the prefix guess stops overriding it
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // A deposit waiting for the player to approve the prompt on their phone.
  const [approving, setApproving] = useState<{ ref: string; amount: string; ussd: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [approveNote, setApproveNote] = useState<string | null>(null);
  // A withdrawal request that just went through: shows the success modal.
  const [withdrawn, setWithdrawn] = useState<{ ref: string; amount: string; network: Network; msisdn: string } | null>(null);
  const [review, setReview] = useState(false); // withdrawals confirm the details before sending

  // Back from the payment provider's approval page (it adds ?status=&tx_ref= to our wallet URL).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get("status");
    if (!q.get("tx_ref") || !status) return;
    setMsg(
      /cancel/i.test(status)
        ? { ok: false, text: "Payment cancelled. Nothing was taken." }
        : { ok: true, text: "Payment submitted. Your balance updates as soon as it's confirmed." },
    );
    window.history.replaceState(null, "", window.location.pathname);
    window.dispatchEvent(new Event("stakra:refresh"));
  }, []);

  const onNumber = (v: string) => {
    setMsisdn(v);
    if (!networkPicked && /^0\d{2}/.test(v)) setNetwork(guessNetwork(v));
  };

  /** How the player approves: a prompt already on their phone, the provider's page, or (sandbox) the confirm panel. */
  const afterCharge = (d: { intent: { ref: string; amount: string }; redirectUrl?: string | null; prompt?: { ussdFallback: string | null } | null }) => {
    if (d.prompt) {
      setApproveNote(null);
      setApproving({ ref: d.intent.ref, amount: formatPesewas(BigInt(d.intent.amount)), ussd: d.prompt.ussdFallback });
    } else if (d.redirectUrl) window.location.assign(d.redirectUrl);
    else setPending(d.intent.ref);
  };

  /** "I've approved it": check now; once credited, go home with the new balance already showing. */
  async function confirmApproved() {
    if (!approving) return;
    setChecking(true);
    setApproveNote(null);
    try {
      const res = await fetch("/api/wallet/deposit/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: approving.ref }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setApproveNote(d.error ?? "Couldn't check right now. Try again in a moment.");
      if (d.status === "SUCCEEDED") {
        window.dispatchEvent(new Event("stakra:refresh"));
        if (d.purpose === "VERIFICATION") {
          // Held for review, not spendable: stay on the wallet and show the updated verification bar.
          setApproving(null);
          setMsg({ ok: true, text: "Verification payment received." });
          return router.refresh();
        }
        try {
          sessionStorage.setItem(FLASH_KEY, `GHS ${formatPesewas(BigInt(d.amount))} added.`);
        } catch {
          /* storage blocked: the balance still shows the new amount */
        }
        router.push("/");
        return router.refresh();
      }
      if (d.status === "FAILED") {
        setApproving(null);
        return setMsg({ ok: false, text: "The payment didn't go through. Nothing was taken." });
      }
      setApproveNote("We haven't received it yet. Approve the prompt on your phone, then tap again.");
    } catch {
      setApproveNote("Network error. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function initiate(e: React.FormEvent) {
    e.preventDefault();
    // Withdrawals: the first submit reviews the details; the next one sends.
    if (mode === "withdraw" && !review) { setReview(true); return; }
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/wallet/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountGhs: Number(amount), msisdn, network, idempotencyKey: newId(), ...(mode === "withdraw" ? { accountName } : {}) }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.status === 202) {
      if (mode === "deposit") {
        afterCharge(d);
      } else {
        setWithdrawn({ ref: d.intent.ref, amount: formatPesewas(BigInt(d.intent.amount)), network, msisdn });
        setReview(false);
        setMsisdn("");
        setAccountName("");
        window.dispatchEvent(new Event("stakra:refresh"));
        router.refresh();
      }
    } else {
      setMsg({ ok: false, text: d.error ?? "Request failed" });
    }
  }

  async function payVerification() {
    if (!/^0\d{9}$/.test(msisdn)) return setMsg({ ok: false, text: "Enter your 10-digit mobile money number first" });
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/wallet/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ msisdn, network, idempotencyKey: newId() }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.status === 202) afterCharge(d);
    else setMsg({ ok: false, text: d.error ?? "Request failed" });
  }

  async function confirmSandbox(outcome: "SUCCEEDED" | "FAILED") {
    if (!pending) return;
    setBusy(true);
    const res = await fetch("/api/wallet/sandbox-confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: pending, outcome }),
    });
    setBusy(false);
    const d = await res.json();
    if (res.ok && d.webhook?.result === "processed") {
      setMsg({ ok: outcome === "SUCCEEDED", text: outcome === "SUCCEEDED" ? "Payment confirmed" : "Payment declined" });
      setPending(null);
      window.dispatchEvent(new Event("stakra:refresh"));
      router.refresh();
    } else {
      setMsg({ ok: false, text: "Already processed" });
    }
  }

  const networkField = (
    <div>
      <label className="label" htmlFor="network">Network</label>
      <select
        id="network"
        className="input"
        value={network}
        onChange={(e) => {
          setNetwork(e.target.value as Network);
          setNetworkPicked(true);
        }}
      >
        {NETWORKS.map((n) => (
          <option key={n} value={n}>
            {NETWORK_LABEL[n]}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="card p-5">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-ink-800 p-1">
        {(["deposit", "withdraw"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setMsg(null); setPending(null); setReview(false); setAmount(m === "deposit" ? depositStart : 0); }}
            className={`rounded-md py-2 text-sm font-semibold capitalize transition ${mode === m ? "bg-lime text-lime-ink" : "text-fog"}`}
          >
            {m}
          </button>
        ))}
      </div>

      {showVerification && <VerificationBar v={verification} busy={busy || !!pending} onPay={payVerification} />}

      {approving ? (
        <section aria-labelledby="approve-title" className="rounded-xl border border-[#EF9F27] bg-[#FAEEDA] p-4">
          <h3 id="approve-title" className="flex items-center gap-2 font-display text-base font-bold text-[#633806]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="7" y="2.5" width="10" height="19" rx="2" />
              <path d="M11 18h2" />
            </svg>
            {checking ? "Confirming your payment" : "Approve on your phone"}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[#854F0B]">
            {checking ? (
              "Checking with your network. This takes a few seconds."
            ) : (
              <>
                GHS {approving.amount} to Kingz Bet. Enter your MoMo PIN on the prompt.
                {approving.ussd && <> No prompt? Dial {approving.ussd}.</>}
              </>
            )}
          </p>
          {approveNote && (
            <p role="status" className="mt-2 text-sm font-semibold text-[#633806]">
              {approveNote}
            </p>
          )}
          <button
            type="button"
            onClick={confirmApproved}
            disabled={checking}
            className={`mt-3 w-full rounded-lg py-3 text-[15px] font-bold transition ${checking ? "bg-[#97C459] text-[#173404]" : "bg-[#16A34A] text-white hover:brightness-110"}`}
          >
            {checking ? "Checking…" : "I've approved it"}
          </button>
          {!checking && (
            <button type="button" onClick={() => setApproving(null)} className="mt-2 w-full py-1 text-center text-xs font-semibold text-[#854F0B] hover:underline">
              Cancel deposit
            </button>
          )}
        </section>
      ) : (
      <form onSubmit={initiate} className="space-y-4">
        {mode === "withdraw" && review ? (
          <>
            <dl className="space-y-2 rounded-lg border border-line bg-ink-800 p-4 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-fog">Amount</dt><dd className="font-bold text-white">GHS {amount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fog">Network</dt><dd className="font-semibold text-white">{NETWORK_LABEL[network]}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fog">Account number</dt><dd className="font-semibold text-white">{msisdn}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fog">Account name</dt><dd className="truncate font-semibold text-white">{accountName}</dd></div>
            </dl>
            <button className="btn-lime w-full py-3" disabled={busy || locked}>
              {busy ? "Working…" : "Confirm and send"}
            </button>
            <button type="button" onClick={() => setReview(false)} disabled={busy} className="w-full py-1 text-center text-xs font-semibold text-fog hover:underline">
              Edit details
            </button>
          </>
        ) : (
          <>
        <div>
          <label className="label" htmlFor="amt">Amount (GHS)</label>
          <input
            id="amt"
            type="number"
            min={mode === "deposit" ? minDepositGhs : 1}
            required
            placeholder={isAdmin ? "" : "e.g. 100"}
            className={`input ${mode === "deposit" ? "text-right font-bold" : ""}`}
            value={amount || ""} // 0 shows the placeholder instead, so a withdrawal starts empty
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>
        {/* Withdrawals are paid by hand, so they ask the way the admin needs it: network, number, then the name on the account. */}
        {mode === "withdraw" && networkField}
        <div>
          <label className="label" htmlFor="msisdn">{mode === "withdraw" ? "Account number" : "Mobile money number"}</label>
          <input
            id="msisdn"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            required
            placeholder="024 000 0000"
            className="input"
            value={msisdn}
            onChange={(e) => onNumber(e.target.value)}
          />
        </div>
        {mode === "withdraw" ? (
          <div>
            <label className="label" htmlFor="acctname">Account name</label>
            <input
              id="acctname"
              type="text"
              autoComplete="name"
              maxLength={60}
              required
              placeholder="Full name on the account"
              className="input"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
        ) : (
          networkField
        )}
        <button className="btn-lime w-full py-3" disabled={busy || locked}>
          {busy ? "Working…" : mode === "deposit" ? "Deposit" : locked ? "Verify to withdraw" : "Request withdrawal"}
        </button>
          </>
        )}
      </form>
      )}

      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`mt-4 rounded-lg border p-3 text-sm ${msg.ok ? "border-win/40 bg-win/10 text-win" : "border-danger/40 bg-danger/10 text-danger"}`}>
          {msg.text}
        </div>
      )}

      {pending && (
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-3">
          <div className="mb-2 flex justify-between text-sm text-warn">
            <span className="font-mono">{pending}</span>
            <span>Pending</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => confirmSandbox("SUCCEEDED")} disabled={busy} className="btn-lime flex-1 py-2 text-sm">
              Approve
            </button>
            <button onClick={() => confirmSandbox("FAILED")} disabled={busy} className="btn-ghost flex-1 py-2 text-sm">
              Decline
            </button>
          </div>
        </div>
      )}

      {withdrawn && <WithdrawalSuccess info={withdrawn} onClose={() => setWithdrawn(null)} />}
      {isAdmin && withdrawn && <WithdrawalBanner info={withdrawn} />}
    </div>
  );
}

/**
 * Admin-only push-style banner that drops in from the top after a withdrawal, with a chime.
 * It is the app announcing what it did (real amount and ref) — not a message from any payment provider.
 */
function WithdrawalBanner({ info }: { info: { ref: string; amount: string } }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const tIn = setTimeout(() => setShow(true), 20); // let it mount off-screen, then slide in
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12); // two quick notes, like a notification chime
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      /* audio blocked (no gesture / unsupported): the banner still shows */
    }
    const tOut = setTimeout(() => setShow(false), 5000); // auto-dismiss like a real push
    return () => {
      clearTimeout(tIn);
      clearTimeout(tOut);
    };
  }, []);

  return createPortal(
    <div className={`fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-3 transition-transform duration-500 ease-out ${show ? "translate-y-0" : "-translate-y-[150%]"}`}>
      <div className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-ink-700/95 p-3 shadow-lift backdrop-blur">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-lime font-display text-lg font-bold text-lime-ink">K</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-bold text-white">Kingz Bet</span>
            <span className="text-fog">now</span>
          </div>
          <p className="mt-0.5 text-sm leading-snug text-white">Withdrawal of GHS {info.amount} processed · Ref {info.ref}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Withdrawal confirmation: the request went through and the money left the player's balance.
 * Payouts are sent by hand, so the copy says it is on the way, never that it has already landed.
 */
function WithdrawalSuccess({ info, onClose }: { info: { ref: string; amount: string; network: Network; msisdn: string }; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="wdr-ok-title" className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 animate-fade-in bg-[#04060A]/55 backdrop-blur-[4px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md animate-win-pop rounded-t-3xl border border-line bg-ink-700 p-6 pb-8 text-center text-white shadow-lift sm:rounded-3xl sm:p-8 motion-reduce:animate-none">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-line text-lg text-fog transition hover:bg-ink-600 hover:text-white"
        >
          ✕
        </button>

        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-lime/15">
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-lime" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <path d="M7.5 12.5l3 3 6-6.5" />
          </svg>
        </div>

        <h2 id="wdr-ok-title" className="mt-5 font-display text-2xl font-bold">
          Withdrawal successful
        </h2>

        <div className="mt-5 rounded-2xl border border-lime/30 bg-lime/[0.06] px-4 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fog">Withdrawal amount</p>
          <p className="mt-1 font-display text-4xl font-extrabold tabular-nums text-lime">GHS {info.amount}</p>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-fog">
          On its way to your {NETWORK_LABEL[info.network]} number <span className="font-semibold text-white">{info.msisdn}</span>. It reaches your mobile money shortly.
        </p>
        <p className="mt-1 text-xs text-fog-muted">Reference {info.ref}</p>

        <button onClick={onClose} className="btn-lime mt-6 w-full py-3.5 text-base">
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Withdrawal verification: two separate GHS 500 verification payments (normal deposits don't
 * count). The bar fills halfway after the first and completely after the second; the money is
 * held until an admin reviews it, then released to the balance.
 */
function VerificationBar({ v, busy, onPay }: { v: Verification; busy: boolean; onPay: () => void }) {
  const verified = v.status === "VERIFIED";
  const paid = verified ? v.needed : Math.min(v.paid, v.needed);
  const pct = Math.round((paid / v.needed) * 100);
  const label = verified ? "Verified" : paid >= v.needed ? "Awaiting review" : paid > 0 ? "Partly paid" : v.status === "REJECTED" ? "Not approved" : "Not started";
  const tone = verified ? "bg-lime/15 text-lime" : paid > 0 ? "bg-warn/15 text-warn" : v.status === "REJECTED" ? "bg-danger/15 text-danger" : "bg-ink-500 text-fog";
  const canPay = !verified && paid < v.needed;
  return (
    <section aria-labelledby="verify-title" className="mb-4 rounded-lg border border-line bg-ink-600/40 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="verify-title" className="text-sm font-bold text-white">
          Withdrawal verification
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Withdrawal verification"
        aria-valuemin={0}
        aria-valuemax={v.needed}
        aria-valuenow={paid}
        aria-valuetext={verified ? "Verified" : `${paid} of ${v.needed} verification payments made`}
        className="relative h-3 overflow-hidden rounded-full bg-ink-500"
      >
        <div className={`h-full rounded-full transition-[width] duration-700 ${verified ? "bg-lime" : "bg-warn"}`} style={{ width: `${pct}%` }} />
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink-700" />
      </div>
      {!verified && <p className="mt-2 text-xs text-fog">{v.heldGhs > 0 ? `GHS ${v.heldGhs} held, ` : "Held, "}returned to your balance after review</p>}
      {canPay && (
        <button type="button" onClick={onPay} disabled={busy} className="btn-lime mt-3 w-full py-2.5 text-sm">
          Pay GHS {v.perPaymentGhs} to verify{paid > 0 ? ` (${paid + 1} of ${v.needed})` : ""}
        </button>
      )}
    </section>
  );
}
