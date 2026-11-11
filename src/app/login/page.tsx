"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Turnstile, turnstileRequired } from "@/components/Turnstile";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password, remember, turnstileToken: token }),
      });
      if (res.ok) {
        window.dispatchEvent(new Event("sb:refresh"));
        router.push("/");
        router.refresh();
        return;
      }
      setErr((await res.json()).error ?? "Login failed");
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
      setAttempt((n) => n + 1); // tokens are single-use
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your Bet Zone account."
      footer={
        <>
          New to Bet Zone?{" "}
          <Link href="/register" className="font-semibold text-lime hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {err && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{err}</div>}
        <div>
          <label className="label" htmlFor="identifier">Phone or email</label>
          <input id="identifier" required autoComplete="username" placeholder="024 123 4567 or you@example.com" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-fog">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-lime" />
            Remember me
          </label>
          <Link href="/forgot-password" className="font-semibold text-lime hover:underline">
            Forgot password?
          </Link>
        </div>
        <Turnstile onToken={setToken} resetKey={attempt} />
        <button className="btn-lime w-full py-3" disabled={busy || (turnstileRequired && !token)}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AuthShell>
  );
}
