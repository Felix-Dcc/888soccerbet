"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { newId } from "@/lib/clientId";
import { formatPesewas } from "@/lib/money";
import { FLASH_KEY } from "@/components/FlashNotice";
import { CopyButton } from "@/components/CopyButton";
import { BrandMark, Logo } from "@/components/Logo";
import { formatStamp } from "@/lib/time";
import { NETWORKS, guessNetwork, type Network } from "@/lib/providers/payments/types";

const NETWORK_LABEL: Record<Network, string> = { MTN: "MTN MoMo", TELECEL: "Telecel Cash", AIRTELTIGO: "AirtelTigo Money" };

type Mode = "deposit" | "withdraw";
interface VerificationStage { paid: number; needed: number; perPaymentGhs: number; heldGhs: number; }
interface Verification {
  required: boolean;
  stage: "kyc" | "ntt";
  kyc: VerificationStage;
  ntt: VerificationStage;
  status: string;
}

export function WalletPanel({ minDepositGhs, isAdmin = false, verification }: { minDepositGhs: number; isAdmin?: boolean; verification: Verification }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("deposit");
  const depositStart = isAdmin ? 0 : minDepositGhs; // admins start the deposit box empty; players keep the default
  const [amount, setAmount] = useState(depositStart);
  const verified = verification.status === "VERIFIED";
  const locked = mode === "withdraw" && verification.required && !verified;
  const showVerification = verification.required || verification.kyc.heldGhs > 0 || verification.ntt.heldGhs > 0;
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
    window.dispatchEvent(new Event("sb:refresh"));
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
        window.dispatchEvent(new Event("sb:refresh"));
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
        window.dispatchEvent(new Event("sb:refresh"));
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
      window.dispatchEvent(new Event("sb:refresh"));
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
                GHS {approving.amount} to Bet Zone. Enter your MoMo PIN on the prompt.
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
        <BrandMark size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-bold text-white">Bet Zone</span>
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
 * Withdrawal confirmation, laid out as a receipt: the logo on the brand header, a check badge,
 * the amount, then where the payout stands and its details. Payouts are sent by hand, so the copy
 * says it is on the way, never that it has already landed.
 */
function WithdrawalSuccess({ info, onClose }: { info: { ref: string; amount: string; network: Network; msisdn: string }; onClose: () => void }) {
  const [at] = useState(() => new Date());
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

  const steps = [
    { label: "Requested", done: true },
    { label: "Balance debited", done: true },
    { label: "Paid to MoMo", done: false },
  ];

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="wdr-ok-title" className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="fixed inset-0 animate-fade-in bg-[#04060A]/60 backdrop-blur-[4px]" onClick={onClose} />
      <div className="relative z-10 max-h-[94vh] w-full max-w-md animate-win-pop overflow-y-auto rounded-t-3xl border border-line bg-ink-700 text-white shadow-lift sm:rounded-3xl motion-reduce:animate-none">
        {/* receipt head: the logo on the site's dark navy, with a soft green swoosh */}
        <div className="theme-dark relative isolate flex h-32 items-start justify-center overflow-hidden bg-[linear-gradient(135deg,#17202E_0%,#040913_60%,#0C1421_100%)] pt-5">
          <svg aria-hidden className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 400 128" preserveAspectRatio="none">
            <path d="M90 128 Q230 30 420 10 Q262 66 150 128 Z" fill="#00BA3B" opacity=".15" />
          </svg>
          <Logo size="lg" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-lg text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* check badge, overlapping the head */}
        <div className="relative -mt-10 flex justify-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-lime text-lime-ink shadow-lift ring-[6px] ring-ink-700">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" className="animate-draw motion-reduce:animate-none" />
            </svg>
          </span>
        </div>

        <div className="px-6 pb-5 pt-4 text-center">
          <h2 id="wdr-ok-title" className="font-display text-2xl font-extrabold tracking-tight">
            Withdrawal successful
          </h2>
          <p className="mt-1 text-sm text-fog">Your request is in and the money is on its way.</p>

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-fog-muted">Amount</p>
          <p className="mt-1 font-display text-[40px] font-extrabold leading-none tabular-nums text-gold">
            <span className="mr-1.5 text-lg font-bold text-gold/80">GHS</span>
            {info.amount}
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-bold text-gold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold motion-reduce:animate-none" aria-hidden />
            Processing
          </span>
        </div>

        {/* where the payout stands */}
        <ol aria-label="Payout progress" className="mx-6 grid grid-cols-3 rounded-xl bg-ink-600 px-2 py-3">
          {steps.map((s, i) => (
            <li key={s.label} className="relative flex flex-col items-center gap-1.5 text-center">
              {i > 0 && <span aria-hidden className={`absolute right-1/2 top-2.5 h-0.5 w-full ${s.done ? "bg-lime" : "bg-ink-400"}`} />}
              <span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full ${s.done ? "bg-lime text-lime-ink" : "border-2 border-gold bg-ink-600"}`}>
                {s.done ? (
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
                )}
              </span>
              <span className={`text-[11px] font-semibold leading-tight ${s.done ? "text-white" : "text-fog"}`}>
                {s.label}
                <span className="sr-only">{s.done ? " (done)" : " (in progress)"}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* tear line */}
        <div aria-hidden className="mx-6 mt-5 border-t-2 border-dashed border-line" />

        <dl className="divide-y divide-line px-6 py-2 text-sm">
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-fog-muted">Sent to</dt>
            <dd className="min-w-0 truncate text-right font-semibold">
              {NETWORK_LABEL[info.network]} · <span className="tabular-nums">{info.msisdn}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-fog-muted">Reference</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono font-semibold tracking-wide">{info.ref}</span>
              <CopyButton text={info.ref} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-fog-muted">Date</dt>
            <dd className="font-semibold tabular-nums">{formatStamp(at)}</dd>
          </div>
        </dl>

        <div className="px-6 pb-7 pt-2">
          <button onClick={onClose} className="btn-lime w-full py-3.5 text-base">
            Done
          </button>
          <p className="mt-3 text-center text-xs text-fog-muted">Keep the reference in case you need to contact support.</p>
        </div>
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
function StageBar({ title, stage, status, rejected, done, busy, onPay }: { title: string; stage: VerificationStage; status: string; rejected: boolean; done: boolean; busy: boolean; onPay: () => void }) {
  const paid = done ? stage.needed : Math.min(stage.paid, stage.needed);
  const pct = Math.round((paid / stage.needed) * 100);
  const label = done ? "Approved" : paid >= stage.needed ? "Awaiting review" : paid > 0 ? "Partly paid" : rejected ? "Not approved" : "Not started";
  const tone = done ? "bg-lime/15 text-lime" : paid > 0 ? "bg-warn/15 text-warn" : rejected ? "bg-danger/15 text-danger" : "bg-ink-500 text-fog";
  const canPay = !done && paid < stage.needed;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fog-muted">{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>
      </div>
      <div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={stage.needed} aria-valuenow={paid} className="relative h-2.5 overflow-hidden rounded-full bg-ink-500">
        <div className={`h-full rounded-full transition-[width] duration-700 ${done ? "bg-lime" : "bg-warn"}`} style={{ width: `${pct}%` }} />
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink-700" />
      </div>
      {!done && stage.heldGhs > 0 && <p className="mt-1 text-[11px] text-fog">GHS {stage.heldGhs} held — returned after review</p>}
      {canPay && (
        <button type="button" onClick={onPay} disabled={busy} className="btn-lime mt-2 w-full py-2 text-sm">
          Pay GHS {stage.perPaymentGhs}{paid > 0 ? ` (${paid + 1} of ${stage.needed})` : ""}
        </button>
      )}
    </div>
  );
}

function VerificationBar({ v, busy, onPay }: { v: Verification; busy: boolean; onPay: () => void }) {
  const fullyVerified = v.status === "VERIFIED";
  const kycDone = ["KYC_APPROVED", "NTT_PENDING", "NTT_REJECTED", "VERIFIED"].includes(v.status);
  const inNtt = v.stage === "ntt";
  return (
    <section aria-labelledby="verify-title" className="mb-4 rounded-lg border border-line bg-ink-600/40 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="verify-title" className="text-sm font-bold text-white">Withdrawal verification</h3>
        {fullyVerified && <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[11px] font-bold text-lime">Verified</span>}
      </div>
      <div className="space-y-3">
        <StageBar title="Stage 1 — KYC" stage={v.kyc} status={v.status} rejected={v.status === "REJECTED"} done={kycDone} busy={busy} onPay={onPay} />
        {(inNtt || fullyVerified) && (
          <StageBar title="Stage 2 — NTT Compliance" stage={v.ntt} status={v.status} rejected={v.status === "NTT_REJECTED"} done={fullyVerified} busy={busy} onPay={onPay} />
        )}
      </div>
      {!fullyVerified && <p className="mt-2 text-xs text-fog">All held money is returned to your balance after review, whether approved or not.</p>}
    </section>
  );
}
