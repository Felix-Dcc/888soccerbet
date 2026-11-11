"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Turnstile, turnstileRequired } from "@/components/Turnstile";

/** nigeria: Nigerian sign-ups are open (a Naira rate is set and Flutterwave is configured). */
export function RegisterForm({ nigeria }: { nigeria: boolean }) {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense>
      <Form nigeria={nigeria} />
    </Suspense>
  );
}

/** One short step: full name, email, password and confirmation. No phone, birth date or email code. */
function Form({ nigeria }: { nigeria: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  // An agent's referral link (?ref=CODE) still credits the sign-up to them; there is no field to type one.
  const referralCode = params.get("ref") ?? "";
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", country: "GH" });
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const onInput = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(k)(e.target.value);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Quick client checks; the server re-checks all of it.
    if (form.name.trim().length < 2) return setErr("Enter your full name");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setErr("Enter a valid email");
    if (form.password.length < 8) return setErr("Password must be at least 8 characters");
    if (form.password !== form.confirmPassword) return setErr("Passwords don't match");
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          country: nigeria && form.country === "NG" ? "NG" : "GH",
          acceptTerms: accepted,
          turnstileToken: token,
          ...(referralCode ? { referralCode, referralSource: "LINK" } : {}),
        }),
      });
      if (res.ok) {
        window.dispatchEvent(new Event("sb:refresh"));
        router.push("/");
        router.refresh();
        return;
      }
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "Registration failed");
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
      setAttempt((n) => n + 1); // tokens are single-use
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes a few seconds. You must be 18 or older."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-lime hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {err && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{err}</div>}

        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" required maxLength={60} className="input" value={form.name} onChange={onInput("name")} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input id="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" value={form.email} onChange={onInput("email")} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          <p className="mt-1.5 text-xs text-fog-muted">At least 8 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirmPassword">Confirm password</label>
          <PasswordInput id="confirmPassword" autoComplete="new-password" value={form.confirmPassword} onChange={set("confirmPassword")} />
        </div>
        {nigeria && (
          <div>
            <label className="label" htmlFor="country">Country</label>
            <select id="country" className="input" value={form.country} onChange={onInput("country")}>
              <option value="GH">Ghana</option>
              <option value="NG">Nigeria</option>
            </select>
          </div>
        )}
        <div className="flex items-start gap-3">
          <input
            id="acceptTerms"
            type="checkbox"
            required
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--lime))]"
          />
          <label htmlFor="acceptTerms" className="text-sm leading-snug text-white">
            I&apos;m 18 or older and accept the{" "}
            <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-lime underline underline-offset-2">
              Terms &amp; Conditions
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-lime underline underline-offset-2">
              Privacy Policy
            </a>
          </label>
        </div>
        <Turnstile onToken={setToken} resetKey={attempt} />
        <button className="btn-lime w-full py-3" disabled={busy || !accepted || (turnstileRequired && !token)}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
