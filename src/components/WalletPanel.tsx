"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { newId } from "@/lib/clientId";
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

export function WalletPanel({ minDepositGhs, verification }: { minDepositGhs: number; verification: Verification }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState(minDepositGhs);
  const verified = verification.status === "VERIFIED";
  const locked = mode === "withdraw" && verification.required && !verified;
  // Hidden until a big win makes it apply (or money is already held for review).
  const showVerification = verification.required || verification.heldGhs > 0;
  const [msisdn, setMsisdn] = useState("");
  const [network, setNetwork] = useState<Network>("MTN");
  const [networkPicked, setNetworkPicked] = useState(false); // once chosen by hand, the prefix guess stops overriding it
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  /** Off to the provider's page to approve, when it has one; otherwise the sandbox confirm panel. */
  const afterCharge = (d: { intent: { ref: string }; redirectUrl?: string | null }) => {
    if (d.redirectUrl) window.location.assign(d.redirectUrl);
    else setPending(d.intent.ref);
  };

  async function initiate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/wallet/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountGhs: Number(amount), msisdn, network, idempotencyKey: newId() }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.status === 202) {
      if (mode === "deposit") {
        afterCharge(d);
      } else {
        setMsg({ ok: true, text: `Withdrawal ${d.intent.ref} sent. It reaches your mobile money shortly.` });
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

  return (
    <div className="card p-5">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-ink-800 p-1">
        {(["deposit", "withdraw"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setMsg(null); setPending(null); }}
            className={`rounded-md py-2 text-sm font-semibold capitalize transition ${mode === m ? "bg-lime text-lime-ink" : "text-fog"}`}
          >
            {m}
          </button>
        ))}
      </div>

      {showVerification && <VerificationBar v={verification} busy={busy || !!pending} onPay={payVerification} />}

      <form onSubmit={initiate} className="space-y-4">
        <div>
          <label className="label" htmlFor="amt">Amount (GHS)</label>
          <input
            id="amt"
            type="number"
            min={mode === "deposit" ? minDepositGhs : 1}
            className="input text-right font-bold"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="mt-2 flex gap-2">
            {[50, 100, 200, 500].map((v) => (
              <button type="button" key={v} onClick={() => setAmount(v)} className="flex-1 rounded-lg border border-line py-1.5 text-xs font-semibold text-fog hover:border-lime hover:text-lime">
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="msisdn">Mobile money number</label>
          <input id="msisdn" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} required className="input" value={msisdn} onChange={(e) => onNumber(e.target.value)} />
        </div>
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
        <button className="btn-lime w-full py-3" disabled={busy || locked}>
          {busy ? "Working…" : mode === "deposit" ? "Deposit" : locked ? "Verify to withdraw" : "Withdraw"}
        </button>
      </form>

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
    </div>
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
          Pay GHS {v.perPaymentGhs} to verify ({paid + 1} of {v.needed})
        </button>
      )}
    </section>
  );
}
