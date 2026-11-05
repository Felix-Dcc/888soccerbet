"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Turnstile, turnstileRequired } from "@/components/Turnstile";

const STEP1_FIELDS = new Set(["email", "password", "confirmPassword"]);
const STEP1_CODES = new Set(["EMAIL_TAKEN"]);

export default function RegisterPage() {
  // useSearchParams needs a Suspense boundary on a statically rendered page.
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    dateOfBirth: "",
    referralCode: params.get("ref") ?? "",
  });
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const onInput = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value);

  // Latest date of birth that is 18+ today; the picker won't offer anything younger.
  const adultCutoff = new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().slice(0, 10);

  function next(e: React.FormEvent) {
    e.preventDefault();
    // Quick client checks so step 1 mistakes surface before step 2; the server re-checks all of it.
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setErr("Enter a valid email");
    if (form.password.length < 8) return setErr("Password must be at least 8 characters");
    if (form.password !== form.confirmPassword) return setErr("Passwords don't match");
    setErr("");
    setStep(2);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) return setErr("Enter your name");
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          acceptTerms: accepted,
          turnstileToken: token,
          // Unchanged code from the ?ref= link counts as a link sign-up; anything typed is a code.
          referralSource: form.referralCode && form.referralCode === (params.get("ref") ?? "") ? "LINK" : "CODE",
        }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        window.dispatchEvent(new Event("sb:refresh"));
        router.push(d.verify ? "/verify-email" : "/");
        router.refresh();
        return;
      }
      const d = await res.json();
      const field = d.issues?.[0]?.path?.[0];
      if (STEP1_CODES.has(d.code) || STEP1_FIELDS.has(field)) setStep(1);
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
      subtitle="It takes about a minute. You must be 18 or older."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-lime hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <div className="mb-6">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-white">{step === 1 ? "Account details" : "Your profile"}</span>
          <span className="text-fog-muted">Step {step} of 2</span>
        </div>
        <ol className="mt-2 grid grid-cols-2 gap-1.5" aria-label="Steps">
          {[1, 2].map((n) => (
            <li key={n} aria-current={step === n ? "step" : undefined} className={`h-1 rounded-full ${n <= step ? "bg-lime" : "bg-ink-600"}`}>
              <span className="sr-only">Step {n}</span>
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={step === 1 ? next : submit} className="space-y-5" noValidate>
        {err && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{err}</div>}

        {step === 1 ? (
          <>
            <div>
              <label className="label" htmlFor="email">Email</label>
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
            <button className="btn-lime w-full py-3">Continue</button>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" autoComplete="name" required maxLength={60} className="input" value={form.name} onChange={onInput("name")} />
            </div>
            <div>
              <label className="label" htmlFor="phone">Mobile number</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="024 123 4567" className="input" value={form.phone} onChange={onInput("phone")} />
            </div>
            <div>
              <label className="label" htmlFor="dob">Date of birth</label>
              <input id="dob" type="date" required max={adultCutoff} className="input" value={form.dateOfBirth} onChange={onInput("dateOfBirth")} />
            </div>
            <div>
              <label className="label" htmlFor="referralCode">Referral code</label>
              <input id="referralCode" autoCapitalize="characters" autoComplete="off" placeholder="Optional" className="input uppercase placeholder:normal-case placeholder:text-fog-muted" value={form.referralCode} onChange={onInput("referralCode")} />
            </div>
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
            <div className="flex gap-2">
              <button type="button" onClick={() => { setErr(""); setStep(1); }} className="btn-ghost px-4 py-3">
                Back
              </button>
              <button className="btn-lime flex-1 py-3" disabled={busy || !accepted || (turnstileRequired && !token)}>
                {busy ? "Creating…" : "Create account"}
              </button>
            </div>
          </>
        )}
      </form>
    </AuthShell>
  );
}
