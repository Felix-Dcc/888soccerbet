"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.dispatchEvent(new Event("stakra:refresh"));
        router.push("/");
        router.refresh();
      }}
      className="btn-ghost px-4 py-2 text-sm"
    >
      Log out
    </button>
  );
}

export function ResponsibleGamblingForm({ initial }: { initial: { daily: string | null; maxStake: string | null } }) {
  const router = useRouter();
  const [daily, setDaily] = useState(initial.daily ?? "");
  const [maxStake, setMaxStake] = useState(initial.maxStake ?? "");
  const [excludeDays, setExcludeDays] = useState(0);
  const [msg, setMsg] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    body.dailyDepositLimitGhs = daily === "" ? null : Number(daily);
    body.maxStakeGhs = maxStake === "" ? null : Number(maxStake);
    if (excludeDays > 0) body.selfExcludeDays = excludeDays;
    const res = await fetch("/api/account/limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setMsg(res.ok ? "Saved." : "Could not save.");
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="label" htmlFor="daily">Daily deposit limit (GHS)</label>
        <input id="daily" type="number" min={0} placeholder="No limit" className="input" value={daily} onChange={(e) => setDaily(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="maxstake">Max stake per bet (GHS)</label>
        <input id="maxstake" type="number" min={0} placeholder="No limit" className="input" value={maxStake} onChange={(e) => setMaxStake(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="excl">Self-exclude for</label>
        <select id="excl" className="input" value={excludeDays} onChange={(e) => setExcludeDays(Number(e.target.value))}>
          <option value={0}>Don&apos;t exclude</option>
          <option value={1}>24 hours</option>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={180}>6 months</option>
        </select>
      </div>
      <button className="btn-lime px-5 py-2.5">Save settings</button>
      {msg && <span role="status" className="ml-3 text-sm text-fog">{msg}</span>}
    </form>
  );
}
