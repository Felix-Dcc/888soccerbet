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
  { key: "kycVerificationFeeGhs", label: "KYC Verification Fee (GHS)", hint: "Each of the 5 KYC verification payments (Stage 1). The money is held and returned after review.", type: "number" },
  { key: "nttComplianceFeeGhs", label: "NTT Compliance Fee (GHS)", hint: "Each of the 5 NTT compliance payments (Stage 2). The money is held and returned after review.", type: "number" },
  { key: "telegramSupport", label: "Telegram Support Handle / Link", hint: "e.g. @BetZoneCare or https://t.me/BetZoneCare. Shown to players as the floating 'Need help?' button and on their account page; leave blank to hide.", type: "text" },
  { key: "emailSupport", label: "Email Support Address", hint: "Shown to players on their account page and in the Terms, Privacy and Refunds pages. Leave blank to use support@betzone.com.co.", type: "text" },
  { key: "withdrawalCapMultiplier", label: "Withdrawal Cap Multiplier", hint: "Whole number: a single withdrawal can be at most this many times the player's total deposits (e.g. 2). 0 = no cap.", type: "number" },
  { key: "maxPayoutGhs", label: "Maximum Single Bet Payout (GHS)", hint: "The absolute ceiling potential winning payout permitted for any single bet ticket.", type: "number" },
  { key: "ngnPerGhs", label: "Naira per 1 GHS (Nigeria)", hint: "Whole Naira for each GHS, e.g. 130: Nigerians pay ₦130 for GHS 1 and are paid out at the same rate. 0 = Nigeria closed (no Nigerian sign-ups, deposits or withdrawals). Needs the Flutterwave keys on the server.", type: "number" },
];

/** readOnly: for admins who may see the settings but not change them (no system.manage). */
export function PlatformSettingsForm({ initial, readOnly = false }: { initial: PlatformSettings; readOnly?: boolean }) {
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
              step={f.type === "number" ? 1 : undefined}
              readOnly={readOnly}
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

      {readOnly ? (
        <p className="text-sm text-fog">You can view these settings. Changing them needs the system.manage permission.</p>
      ) : (
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
      )}
    </div>
  );
}
