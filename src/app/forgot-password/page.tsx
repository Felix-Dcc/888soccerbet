"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Turnstile, turnstileRequired } from "@/components/Turnstile";

/** Ask for a reset link by email. The answer is the same whether or not the account exists. */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, turnstileToken: token }) });
      if (r.ok) return setSent(true);
      setErr((await r.json().catch(() => ({}))).error ?? "Couldn't send the link");
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
      setAttempt((n) => n + 1); // tokens are single-use
    }
  }

  return (
    <AuthShell title="Reset your password">
      {sent ? (
        <div className="space-y-4" role="status">
          <p className="text-sm text-white">If that account exists, we&apos;ve emailed it a link to choose a new password. The link expires in 30 minutes.</p>
          <Link href="/login" className="btn-lime w-full py-3">
            Back to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {err && (
            <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {err}
            </div>
          )}
          <div>
            <label className="label" htmlFor="identifier">
              Phone or email
            </label>
            <input id="identifier" required autoComplete="username" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </div>
          <Turnstile onToken={setToken} resetKey={attempt} />
          <button className="btn-lime w-full py-3" disabled={busy || !identifier.trim() || (turnstileRequired && !token)}>
            {busy ? "Sending…" : "Email me a reset link"}
          </button>
          <Link href="/login" className="btn-ghost w-full py-3">
            Back to log in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
