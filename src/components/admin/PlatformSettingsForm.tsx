"use client";
import { useState } from "react";
import type { PlatformSettings } from "@prisma/client";

const FIELDS: { key: keyof Omit<PlatformSettings, "id" | "updatedAt">; label: string; hint: string; type: "number" | "text" }[] = [
  { key: "minWithdrawalGhs", label: "Baseline Minimum Withdrawal Amount (GHS)", hint: "The minimum amount a user can withdraw per transaction.", type: "number" },
  { key: "minDepositGhs", label: "Minimum Deposit (GHS)", hint: "The minimum amount a user can deposit per single transaction.", type: "number" },
  { key: "minStakeGhs", label: "Minimum Stake (GHS)", hint: "The lowest stake amount allowed per bet ticket.", type: "number" },
  { key: "maxStakeGhs", label: "Maximum Stake (GHS)", hint: "The highest stake amount allowed per bet ticket.", type: "number" },
  { key: "minDepositToWithdrawGhs", label: "Minimum Deposit Required to Withdraw (GHS)", hint: "The total cumulative deposit a user MUST have made before requesting a withdrawal. 0 = no requirement.", type: "number" },
  { key: "minLifetimeStakeGhs", label: "Minimum Lifetime Stake for Withdrawal (GHS)", hint: "The total cumulative stake a user MUST have placed on bets before requesting a withdrawal. 0 = no requirement.", type: "number" },
  { key: "kycVerificationFeeGhs", label: "Stage 1: KYC Verification Fee (GHS)", hint: "One-time identity verification payment in GHS. Escalated after the user meets the minimum deposit requirement.", type: "number" },
  { key: "nttComplianceFeeGhs", label: "Stage 2: NTT Submission Compliance Fee (GHS)", hint: "National Tax & Tariff (NTT) compliance payment in GHS. Escalated after KYC verification before payout release.", type: "number" },
  { key: "telegramSupport", label: "Telegram Support Handle / Link", hint: "e.g. @BetZoneCare or https://t.me/BetZoneCare. Shown to players as the floating 'Need help?' button and on their account page; leave blank to hide.", type: "text" },
  { key: "emailSupport", label: "Email Support Address", hint: "", type: "text" },
  { key: "withdrawalCapMultiplier", label: "Withdrawal Cap Multiplier", hint: "Maximum withdrawal limit multiplier relative to total cumulative deposits (e.g. 2.0x).", type: "number" },
  { key: "maxPayoutGhs", label: "Maximum Single Bet Payout (GHS)", hint: "The absolute ceiling potential winning payout permitted for any single bet ticket.", type: "number" },
];

export function PlatformSettingsForm({ initial }: { initial: PlatformSettings }) {
  const [values, setValues] = useState<Record<string, string | number>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, initial[f.key]])),
  );
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const save = async () => {
    setSaving(true);
    setFlash(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const raw = values[f.key];
        body[f.key] = f.type === "number" ? Number(raw) : String(raw);
      }
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        setFlash({ ok: false, msg: error });
      } else {
        setFlash({ ok: true, msg: "Platform settings saved." });
      }
    } catch {
      setFlash({ ok: false, msg: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="rounded-2xl border border-line bg-ink-700 p-5 shadow-card">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-lime">{f.label}</label>
            <input
              type={f.type === "number" ? "number" : "text"}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-line bg-ink-800 px-4 text-base tabular-nums text-white shadow-card placeholder:text-fog-muted focus:border-lime/60 focus:outline-none focus:ring-4 focus:ring-lime/15"
              min={f.type === "number" ? 0 : undefined}
            />
            {f.hint && <p className="mt-2 text-xs text-fog">{f.hint}</p>}
          </div>
        ))}
      </div>

      {flash && (
        <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${flash.ok ? "bg-lime/10 text-lime" : "bg-danger/10 text-danger"}`}>
          {flash.msg}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-lime px-6 text-base font-bold text-lime-ink shadow-[0_8px_20px_-8px_rgb(var(--lime)/0.6)] transition-colors hover:bg-lime-600 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        {saving ? "Saving…" : "Save Platform Settings"}
      </button>
    </div>
  );
}
