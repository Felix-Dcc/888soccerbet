"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Enter a valid email");
    if (password.length < 10) return setErr("Use at least 10 characters");
    if (password !== confirm) return setErr("Passwords don't match");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/account/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), password, confirmPassword: confirm }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(d.error ?? "Couldn't create your account");
      window.dispatchEvent(new Event("sb:refresh"));
      router.push("/admin");
      router.refresh();
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-fog">You&apos;ve been invited to be a Bet Zone administrator. Choose the email and password you&apos;ll sign in with.</p>
      {err && (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {err}
        </div>
      )}
      <div>
        <label className="label" htmlFor="inv-email">
          Email
        </label>
        <input id="inv-email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="inv-pw">
          Password
        </label>
        <PasswordInput id="inv-pw" autoComplete="new-password" value={password} onChange={setPassword} />
      </div>
      <div>
        <label className="label" htmlFor="inv-pw2">
          Confirm password
        </label>
        <PasswordInput id="inv-pw2" autoComplete="new-password" value={confirm} onChange={setConfirm} />
      </div>
      <button className="btn-lime w-full py-3" disabled={busy}>
        {busy ? "Creating account…" : "Create admin account"}
      </button>
    </form>
  );
}
