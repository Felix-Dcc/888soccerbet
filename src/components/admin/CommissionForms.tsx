"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { newId } from "@/lib/clientId";
import { ConfirmDialog, send } from "./ConfirmDialog";

const URL = "/api/admin/commission";
// 0 to 100, at most 2 decimals; returns the percentage or null.
const parsePct = (s: string) => (/^\d{1,3}(\.\d{1,2})?$/.test(s.trim()) && Number(s) <= 100 ? Number(s) : null);
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (bp: number) => `${(bp / 100).toString()}%`;

/** Super admin: the rate every admin without their own rate earns. */
export function DefaultRateForm({ bp }: { bp: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(bp / 100));
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const pct = parsePct(value);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (pct !== null) setOpen(true);
      }}
    >
      <label className="label" htmlFor="cm-default">Default rate (%)</label>
      <div className="flex gap-2">
        <input id="cm-default" inputMode="decimal" className="input w-28 tabular-nums" value={value} onChange={(e) => { setValue(e.target.value.replace(/[^\d.]/g, "")); setDone(null); }} />
        <button disabled={pct === null || Math.round(pct * 100) === bp} className="btn-lime px-4 py-2 text-sm">Save</button>
      </div>
      {pct === null && value !== "" && <p className="text-xs text-danger">Enter 0 to 100, up to 2 decimal places.</p>}
      {done && <p role="status" className="text-xs text-lime">{done}</p>}
      <p className="text-xs text-fog">Used for every admin without a rate of their own. Commission always uses the current rate, so changing it changes what they have earned.</p>
      <ConfirmDialog
        open={open}
        title="Change the default rate"
        message={<>Set the default commission rate from <b className="text-white">{fmtPct(bp)}</b> to <b className="text-white">{pct ?? 0}%</b>? Every admin on the default rate is recalculated.</>}
        confirmLabel="Save rate"
        onClose={() => setOpen(false)}
        onConfirm={async (password) => {
          const { error } = await send(URL, "POST", { action: "default", ratePct: pct, password });
          if (error) return error;
          setOpen(false);
          setDone("Default rate saved");
          router.refresh();
          return null;
        }}
      />
    </form>
  );
}

/** Super admin: one admin's own rate, or back to the default. */
export function SetRateButton({ adminId, name, bp, isDefault, defaultBp }: { adminId: string; name: string; bp: number; isDefault: boolean; defaultBp: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [useDefault, setUseDefault] = useState(isDefault);
  const [value, setValue] = useState(String(bp / 100));
  const pct = parsePct(value);
  return (
    <>
      <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { setUseDefault(isDefault); setValue(String(bp / 100)); setOpen(true); }}>
        Set rate
      </button>
      <ConfirmDialog
        open={open}
        title="Set commission rate"
        message={
          <div className="space-y-3">
            <p>Commission rate for <b className="text-white">{name}</b>. The default is {fmtPct(defaultBp)}.</p>
            <div>
              <label className="label" htmlFor={`cr-${adminId}`}>Rate (%)</label>
              <input id={`cr-${adminId}`} inputMode="decimal" disabled={useDefault} className="input tabular-nums disabled:opacity-50" value={useDefault ? String(defaultBp / 100) : value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-white">
              <input type="checkbox" checked={useDefault} onChange={(e) => setUseDefault(e.target.checked)} />
              Use the default rate
            </label>
          </div>
        }
        confirmLabel="Save rate"
        onClose={() => setOpen(false)}
        onConfirm={async (password) => {
          if (!useDefault && pct === null) return "Enter 0 to 100, up to 2 decimal places";
          const { error } = await send(URL, "POST", { action: "rate", adminId, ratePct: useDefault ? null : pct, password });
          if (error) return error;
          setOpen(false);
          router.refresh();
          return null;
        }}
      />
    </>
  );
}

/** Super admin: record commission paid to an admin (paid outside the site), up to what they're owed. */
export function RecordPayoutButton({ adminId, name, owedGhs }: { adminId: string; name: string; owedGhs: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newId);
  const value = /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Number(amount) : 0;
  if (owedGhs <= 0)
    return (
      <button type="button" disabled className="btn-lime px-3 py-1.5 text-xs opacity-50">
        Nothing owed
      </button>
    );
  return (
    <>
      <button type="button" className="btn-lime px-3 py-1.5 text-xs" onClick={() => { setAmount(owedGhs.toFixed(2)); setNote(""); setOpen(true); }}>
        Record payout
      </button>
      <ConfirmDialog
        open={open}
        title="Record commission payout"
        message={
          <div className="space-y-3">
            <p>
              Record commission you paid to <b className="text-white">{name}</b>. They are owed <b className="text-white">GHS {money(owedGhs)}</b>. This records the payment; it doesn&apos;t send money.
            </p>
            <div>
              <label className="label" htmlFor={`cp-amt-${adminId}`}>Amount (GHS)</label>
              <input id={`cp-amt-${adminId}`} inputMode="decimal" className="input tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div>
              <label className="label" htmlFor={`cp-note-${adminId}`}>Note (optional)</label>
              <input id={`cp-note-${adminId}`} maxLength={300} placeholder="e.g. MoMo reference" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        }
        confirmLabel="Record payout"
        onClose={() => setOpen(false)}
        onConfirm={async (password) => {
          if (value <= 0) return "Enter an amount above zero, up to 2 decimal places";
          if (value > owedGhs) return `That's more than the GHS ${money(owedGhs)} they're owed`;
          const { error } = await send(URL, "POST", { action: "payout", adminId, amountGhs: value, note: note.trim() || undefined, idempotencyKey: key, password });
          if (error) return error;
          setOpen(false);
          setKey(newId()); // the next payout is a new one
          router.refresh();
          return null;
        }}
      />
    </>
  );
}

/** An admin asks to be paid commission they are owed (up to that amount); a super admin approves or rejects it. */
export function RequestPayoutButton({ owedGhs }: { owedGhs: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const value = /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Number(amount) : 0;
  return (
    <>
      <button type="button" className="btn-lime px-4 py-2 text-sm" onClick={() => { setAmount(owedGhs.toFixed(2)); setOpen(true); }}>
        Request payout
      </button>
      <ConfirmDialog
        open={open}
        title="Request a payout"
        message={
          <div className="space-y-3">
            <p>
              Ask a super admin to pay you commission. You are owed <b className="text-white">GHS {money(owedGhs)}</b>. Once they approve, the payment is recorded here.
            </p>
            <div>
              <label className="label" htmlFor="rq-amt">Amount (GHS)</label>
              <input id="rq-amt" inputMode="decimal" className="input tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div>
              <label className="label" htmlFor="rq-note">Where to pay you</label>
              <input id="rq-note" maxLength={200} placeholder="e.g. MTN MoMo 024 123 4567, Kofi Mensah" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        }
        confirmLabel="Send request"
        onClose={() => setOpen(false)}
        onConfirm={async (password) => {
          if (value <= 0) return "Enter an amount above zero, up to 2 decimal places";
          if (value > owedGhs) return `You can request up to GHS ${money(owedGhs)}`;
          if (note.trim().length < 3) return "Say where to pay you, e.g. your MoMo number";
          const { error } = await send(URL, "POST", { action: "request", amountGhs: value, note: note.trim(), password });
          if (error) return error;
          setOpen(false);
          setNote("");
          router.refresh();
          return null;
        }}
      />
    </>
  );
}

/** Super admin: approve (record as paid) or reject a waiting payout request. */
export function DecideRequestButtons({ requestId, name, amountGhs, note }: { requestId: string; name: string; amountGhs: string; note: string }) {
  const router = useRouter();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="btn-lime px-3 py-1.5 text-xs" onClick={() => setAction("approve")}>
        Approve
      </button>
      <button type="button" className="btn border border-danger/50 px-3 py-1.5 text-xs text-danger hover:bg-danger/10" onClick={() => { setReason(""); setAction("reject"); }}>
        Reject
      </button>
      <ConfirmDialog
        open={action === "approve"}
        title="Approve payout request"
        message={
          <>
            Record <b className="text-white">GHS {amountGhs}</b> as paid to <b className="text-white">{name}</b>. Pay them outside the site to: <b className="text-white">{note}</b>. This doesn&apos;t send money.
          </>
        }
        confirmLabel="Approve"
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error } = await send(URL, "POST", { action: "approve", requestId, password });
          if (error) return error;
          setAction(null);
          router.refresh();
          return null;
        }}
      />
      <ConfirmDialog
        open={action === "reject"}
        danger
        title="Reject payout request"
        message={
          <div className="space-y-3">
            <p>
              Reject <b className="text-white">{name}</b>&apos;s request for <b className="text-white">GHS {amountGhs}</b>? They&apos;ll see your reason and can request again.
            </p>
            <div>
              <label className="label" htmlFor={`rj-${requestId}`}>Reason</label>
              <input id={`rj-${requestId}`} maxLength={300} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        }
        confirmLabel="Reject"
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          if (reason.trim().length < 3) return "Give a reason for rejecting";
          const { error } = await send(URL, "POST", { action: "reject", requestId, reason: reason.trim(), password });
          if (error) return error;
          setAction(null);
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
