"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  return (
    <div className="flex items-center gap-3">
      <button
        className="btn border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/cron", { method: "POST" });
          const d = await r.json();
          setBusy(false);
          setOut(r.ok ? `synced ${d.sync?.fixtures ?? 0}, settled ${d.settle?.settled ?? 0}` : d.error ?? "failed");
          router.refresh();
        }}
      >
        {busy ? "Running…" : "Run sync + settle"}
      </button>
      {out && <span className="text-sm text-white/80">{out}</span>}
    </div>
  );
}

async function settle(body: object): Promise<{ ok: boolean; msg: string }> {
  try {
    const r = await fetch("/api/admin/settle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    return { ok: r.ok, msg: r.ok ? `${d.betsSettled} ${d.betsSettled === 1 ? "bet" : "bets"} settled` : d.error ?? "Failed" };
  } catch {
    return { ok: false, msg: "Network error — try again" };
  }
}

/** datetime-local value (admin's local time) from an ISO instant. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Per-match admin controls in the settlement queue:
 *  - not started: for a manual/generated game, move the kick-off; any game can be voided.
 *  - started: update the live score (no payout), settle with the final score, or void.
 */
export function SettleForm({
  fixtureId, home, away, started, manual = false, startsAt, homeScore, awayScore,
}: { fixtureId: string; home: string; away: string; started: boolean; manual?: boolean; startsAt: string; homeScore?: number | null; awayScore?: number | null }) {
  const router = useRouter();
  const [h, setH] = useState(homeScore != null ? String(homeScore) : "");
  const [a, setA] = useState(awayScore != null ? String(awayScore) : "");
  const [when, setWhen] = useState(toLocalInput(startsAt));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  async function run(body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    const r = await settle(body);
    setBusy(false);
    setMsg(r);
    if (r.ok) router.refresh();
  }

  async function reschedule() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/fixtures", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId, startsAt: new Date(when).toISOString() }) });
      const d = await res.json().catch(() => ({}));
      setMsg({ ok: res.ok, msg: res.ok ? "Kick-off time saved" : d.error ?? "Couldn't change the time" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const valid = /^\d{1,3}$/.test(h) && /^\d{1,3}$/.test(a);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!started && manual && (
        <>
          <input aria-label="Kick-off time" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input py-1.5 text-sm" />
          <button type="button" disabled={busy || !when} onClick={reschedule} className="btn border border-line px-3 py-1.5 text-sm text-white hover:border-lime hover:text-lime">
            Save time
          </button>
        </>
      )}
      {started && (
        <>
          <input aria-label={`${home} score`} inputMode="numeric" placeholder="0" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, "").slice(0, 3))} className="input w-14 py-1.5 text-center" />
          <span className="text-fog-muted">:</span>
          <input aria-label={`${away} score`} inputMode="numeric" placeholder="0" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 3))} className="input w-14 py-1.5 text-center" />
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => run({ action: "live", fixtureId, homeScore: Number(h), awayScore: Number(a) })}
            className="btn border border-line px-3 py-1.5 text-sm text-white hover:border-lime hover:text-lime"
            title="Show this as the live score without paying out"
          >
            Update
          </button>
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => run({ action: "result", fixtureId, homeScore: Number(h), awayScore: Number(a) }, `Settle ${home} ${h} – ${a} ${away}? This pays out and cannot be undone.`)}
            className="btn-lime px-3 py-1.5 text-sm"
          >
            Settle
          </button>
        </>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => run({ action: "void", fixtureId }, `Void ${home} v ${away}? Every selection on it becomes void (stake back on singles, odds 1.00 in multiples).`)}
        className="btn border border-line px-3 py-1.5 text-sm text-fog hover:border-danger hover:text-danger"
      >
        Void
      </button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-win" : "text-danger"}`}>{msg.msg}</span>}
    </div>
  );
}

/** One click creates a random fictional match (fictional teams, odds, future kick-off) and opens it for betting. */
export function GenerateMatchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  return (
    <div className="flex items-center gap-3">
      <button
        className="btn border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("");
          try {
            const r = await fetch("/api/admin/fixtures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generate: true }) });
            const d = await r.json().catch(() => ({}));
            setMsg(r.ok ? `Generated match #${d.fixture?.code} — edit its time below` : d.error ?? "Could not generate");
            if (r.ok) router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Generating…" : "Generate match"}
      </button>
      {msg && <span className="text-sm text-white/80">{msg}</span>}
    </div>
  );
}

const field = "input py-2";
type Sport = "football" | "basketball";

/** Create a game the feed doesn't cover, with admin-set odds. Markets beyond 1X2 are optional. */
export function ManualGameForm({ competitions }: { competitions: { sportKey: string; name: string }[] }) {
  const router = useRouter();
  const [sport, setSport] = useState<Sport>("football");
  const [withTotal, setWithTotal] = useState(false);
  const [withBtts, setWithBtts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value.trim() ?? "";
    const num = (n: string) => (v(n) === "" ? undefined : Number(v(n)));
    const local = v("startsAt");
    const body = {
      sportKey: sport,
      competition: v("competition"),
      homeTeam: v("homeTeam"),
      awayTeam: v("awayTeam"),
      venue: v("venue"),
      // datetime-local is the admin's local time; send an absolute instant.
      startsAt: local ? new Date(local).toISOString() : "",
      result: { home: num("oddsHome"), draw: sport === "football" ? num("oddsDraw") : undefined, away: num("oddsAway") },
      total: withTotal ? { line: num("totalLine"), over: num("oddsOver"), under: num("oddsUnder") } : undefined,
      btts: sport === "football" && withBtts ? { yes: num("oddsYes"), no: num("oddsNo") } : undefined,
    };
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/fixtures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (r.ok) {
        setMsg({ ok: true, msg: `Game added (ID ${d.fixture.code}) and open for betting` });
        form.reset();
        setWithTotal(false);
        setWithBtts(false);
        router.refresh();
      } else setMsg({ ok: false, msg: d.error ?? "Could not add the game" });
    } catch {
      setMsg({ ok: false, msg: "Network error — try again" });
    }
    setBusy(false);
  }

  const odds = (name: string, label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} required inputMode="decimal" type="number" step="0.01" min="1.01" max="1000" className={`${field} text-right tabular-nums`} />
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="Sport" className="flex gap-2">
        {(["football", "basketball"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={sport === s} onClick={() => setSport(s)} className={`chip capitalize ${sport === s ? "chip-active" : ""}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="label">Competition</span>
          <input name="competition" required minLength={2} maxLength={80} list="admin-competitions" placeholder="e.g. Ghana Premier League" className={field} />
          <datalist id="admin-competitions">
            {competitions
              .filter((c) => c.sportKey === sport)
              .map((c) => (
                <option key={c.name} value={c.name} />
              ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">Home team</span>
          <input name="homeTeam" required minLength={2} maxLength={60} className={field} />
        </label>
        <label className="block">
          <span className="label">Away team</span>
          <input name="awayTeam" required minLength={2} maxLength={60} className={field} />
        </label>
        <label className="block">
          <span className="label">Kick-off</span>
          <input name="startsAt" required type="datetime-local" className={field} />
        </label>
        <label className="block">
          <span className="label">Venue (optional)</span>
          <input name="venue" maxLength={80} className={field} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-white">{sport === "football" ? "1X2 odds" : "Winner odds"}</legend>
        <div className={`grid gap-3 ${sport === "football" ? "grid-cols-3" : "grid-cols-2"}`}>
          {odds("oddsHome", "Home (1)")}
          {sport === "football" && odds("oddsDraw", "Draw (X)")}
          {odds("oddsAway", "Away (2)")}
        </div>
      </fieldset>

      <fieldset>
        <label className="flex items-center gap-2 text-sm font-semibold text-white">
          <input type="checkbox" checked={withTotal} onChange={(e) => setWithTotal(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--lime))]" />
          {sport === "football" ? "Total goals" : "Total points"}
        </label>
        {withTotal && (
          <div className="mt-2 grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label">Line</span>
              <input name="totalLine" required type="number" step="0.5" min="0.5" max="400" defaultValue={sport === "football" ? "2.5" : ""} className={`${field} text-right tabular-nums`} />
            </label>
            {odds("oddsOver", "Over")}
            {odds("oddsUnder", "Under")}
          </div>
        )}
      </fieldset>

      {sport === "football" && (
        <fieldset>
          <label className="flex items-center gap-2 text-sm font-semibold text-white">
            <input type="checkbox" checked={withBtts} onChange={(e) => setWithBtts(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--lime))]" />
            Both teams to score
          </label>
          {withBtts && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              {odds("oddsYes", "Yes (GG)")}
              {odds("oddsNo", "No (NG)")}
            </div>
          )}
        </fieldset>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-win" : "text-danger"}`}>
          {msg.msg}
        </p>
      )}
      <button className="btn-lime w-full py-3 sm:w-auto sm:px-8" disabled={busy}>
        {busy ? "Adding…" : "Add game"}
      </button>
    </form>
  );
}

/** Approve or reject a player's withdrawal verification. Either way the held money goes to their balance. */
export function VerificationReview({ userId, email, heldGhs, complete }: { userId: string; email: string; heldGhs: string; complete: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  async function review(action: "approve" | "reject") {
    const text =
      action === "approve"
        ? `Approve ${email}? GHS ${heldGhs} is released to their balance and withdrawals unlock.`
        : `Reject ${email}? GHS ${heldGhs} is returned to their balance; withdrawals stay locked and they can verify again.`;
    if (!window.confirm(text)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, action }) });
      const d = await r.json();
      setMsg({ ok: r.ok, msg: r.ok ? (action === "approve" ? "Approved" : "Rejected") : d.error ?? "Failed" });
      if (r.ok) router.refresh();
    } catch {
      setMsg({ ok: false, msg: "Network error — try again" });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-lime px-3 py-1.5 text-sm" disabled={busy || !complete} title={complete ? undefined : "Both payments must be in first"} onClick={() => review("approve")}>
        Approve
      </button>
      <button type="button" className="btn border border-danger/50 px-3 py-1.5 text-sm text-danger hover:bg-danger/10" disabled={busy} onClick={() => review("reject")}>
        Reject
      </button>
      {msg && <span role="status" className={`text-xs ${msg.ok ? "text-lime" : "text-danger"}`}>{msg.msg}</span>}
    </div>
  );
}
