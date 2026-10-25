"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

type State = "loading" | "signedOut" | "verified" | "pending";

/** Enter the 6-digit code we emailed at sign-up. Deposits and withdrawals unlock once it's confirmed. */
export default function VerifyEmailPage() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) return setState("signedOut");
        setEmail(d.user.email);
        setState(d.user.emailVerified ? "verified" : "pending");
      })
      .catch(() => setState("signedOut"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const r = await fetch("/api/account/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      if (r.ok) {
        window.dispatchEvent(new Event("stakra:refresh"));
        router.push("/");
        router.refresh();
        return;
      }
      setErr((await r.json().catch(() => ({}))).error ?? "Couldn't confirm the code");
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setErr("");
    setNote("");
    const r = await fetch("/api/account/verify-email/resend", { method: "POST" }).catch(() => null);
    if (!r) return setErr("Network error — try again");
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error ?? "Couldn't send a new code");
    if (d.verified) return setState("verified");
    setCode("");
    setNote(`New code sent to ${email}.`);
  }

  return (
    <AuthShell title="Confirm your email">
      {state === "loading" ? (
        <div className="h-40 animate-pulse rounded-lg bg-white/[0.04]" aria-busy="true" />
      ) : state === "signedOut" ? (
        <div className="space-y-4">
          <p className="text-sm text-fog">Log in to confirm your email.</p>
          <Link href="/login" className="btn-lime w-full py-3">
            Log in
          </Link>
        </div>
      ) : state === "verified" ? (
        <div className="space-y-4" role="status">
          <p className="text-sm text-white">Your email is confirmed. You can deposit and withdraw.</p>
          <button type="button" onClick={() => router.push("/wallet")} className="btn-lime w-full py-3">
            Go to wallet
          </button>
          <Link href="/" className="btn-ghost w-full py-3">
            Home
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {err && (
            <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {err}
            </div>
          )}
          {note && (
            <div role="status" className="rounded-lg border border-lime/30 bg-lime/10 p-3 text-sm text-white">
              {note}
            </div>
          )}
          <p className="text-sm text-fog">
            We sent a 6-digit code to <span className="font-semibold text-white">{email}</span>.
          </p>
          <div>
            <label className="label" htmlFor="code">
              Code
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="input text-center font-mono text-2xl tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <button className="btn-lime w-full py-3" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button type="button" onClick={resend} className="btn-ghost w-full py-3">
            Send a new code
          </button>
        </form>
      )}
    </AuthShell>
  );
}
