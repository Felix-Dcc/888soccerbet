"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";

/** Single-use link (admin invite, or a password reset by email): choose a password, then land in the console or on Home. */
export default function AccountSetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setErr("Use at least 10 characters");
    if (password !== confirm) return setErr("Passwords don't match");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/account/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password, confirmPassword: confirm }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(d.error ?? "Couldn't set your password");
      window.dispatchEvent(new Event("sb:refresh"));
      router.push(d.staff ? "/admin" : "/");
      router.refresh();
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose your password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {err && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {err}
          </div>
        )}
        <div>
          <label className="label" htmlFor="np">
            New password
          </label>
          <PasswordInput id="np" autoComplete="new-password" value={password} onChange={setPassword} />
        </div>
        <div>
          <label className="label" htmlFor="npc">
            Confirm password
          </label>
          <PasswordInput id="npc" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        </div>
        <button className="btn-lime w-full py-3" disabled={busy}>
          {busy ? "Saving…" : "Save and sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
