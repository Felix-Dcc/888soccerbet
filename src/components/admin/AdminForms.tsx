"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { newId } from "@/lib/clientId";
import { ConfirmDialog, send } from "./ConfirmDialog";
import { CopyButton } from "@/components/CopyButton";

type PermInfo = { key: string; label: string };
type RoleInfo = { id: string; name: string; permissions: string[] };

function PermissionPicker({ all, value, onChange, idPrefix }: { all: PermInfo[]; value: string[]; onChange: (v: string[]) => void; idPrefix: string }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {all.map((p) => {
        const id = `${idPrefix}-${p.key}`;
        return (
          <label key={p.key} htmlFor={id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-600">
            <input
              id={id}
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--lime))]"
              checked={value.includes(p.key)}
              onChange={(e) => onChange(e.target.checked ? [...value, p.key] : value.filter((v) => v !== p.key))}
            />
            <span className="text-sm">
              <span className="block font-mono text-xs text-white">{p.key}</span>
              <span className="text-fog">{p.label}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Super admin: create an administrator, then hand them their single-use setup link. */
export function CreateAdminForm({ perms, roles }: { perms: PermInfo[]; roles: RoleInfo[] }) {
  const router = useRouter();
  const [f, setF] = useState({ role: "ADMIN" as "ADMIN" | "SUPER_ADMIN", adminRoleId: "" });
  const [grants, setGrants] = useState<string[]>(["dashboard.view", "referrals.view"]);
  const [confirm, setConfirm] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (link)
    return (
      <div role="status" className="space-y-3">
        <p className="text-sm text-white">
          Invite link ready. Send it to the new admin: they open it, choose their own email and password, and get the access you picked. It works once, expires in 72 hours, and is shown
          only now.
        </p>
        <div className="flex gap-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="input min-w-0 flex-1 font-mono text-xs" aria-label="Admin invite link" />
          <CopyButton text={link} label="Copy link" />
        </div>
        <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setLink(null)}>
          Generate another
        </button>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setConfirm(true);
      }}
    >
      <p className="text-sm text-fog">Pick their access, then generate a link. The new admin sets their own email and password from it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="na-type">Type</label>
          <select id="na-type" className="input" value={f.role} onChange={set("role")}>
            <option value="ADMIN">Admin (permissions below)</option>
            <option value="SUPER_ADMIN">Super admin (everything)</option>
          </select>
        </div>
        {f.role === "ADMIN" && (
          <div>
            <label className="label" htmlFor="na-role">Role</label>
            <select id="na-role" className="input" value={f.adminRoleId} onChange={set("adminRoleId")}>
              <option value="">No role (extra permissions only)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {f.role === "ADMIN" && (
        <fieldset>
          <legend className="label">Extra permissions</legend>
          <PermissionPicker all={perms} value={grants} onChange={setGrants} idPrefix="na" />
        </fieldset>
      )}
      <button className="btn-lime px-5 py-2.5 text-sm">Add admin</button>
      <ConfirmDialog
        open={confirm}
        title="Generate admin invite link"
        message={<>Create a single-use link that makes whoever opens it {f.role === "SUPER_ADMIN" ? "a super admin with full access" : "an admin with the access above"}?</>}
        confirmLabel="Generate link"
        onClose={() => setConfirm(false)}
        onConfirm={async (password) => {
          const { error, data } = await send("/api/admin/admins", "POST", {
            role: f.role,
            adminRoleId: f.role === "ADMIN" ? f.adminRoleId || null : null,
            permGrants: f.role === "ADMIN" ? grants : [],
            password,
          });
          if (error) return error;
          setConfirm(false);
          setLink(String(data.inviteUrl));
          router.refresh();
          return null;
        }}
      />
    </form>
  );
}

/** Super admin: change another admin's type, role and individual grants/denials. */
export function AdminAccessEditor({
  adminId,
  perms,
  roles,
  initial,
}: {
  adminId: string;
  perms: PermInfo[];
  roles: RoleInfo[];
  initial: { role: "ADMIN" | "SUPER_ADMIN"; adminRoleId: string | null; permGrants: string[]; permDenials: string[] };
}) {
  const router = useRouter();
  const [role, setRole] = useState(initial.role);
  const [adminRoleId, setAdminRoleId] = useState(initial.adminRoleId ?? "");
  const [grants, setGrants] = useState(initial.permGrants);
  const [denials, setDenials] = useState(initial.permDenials);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const fromRole = roles.find((r) => r.id === adminRoleId)?.permissions ?? [];

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setConfirm(true);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ae-type">Type</label>
          <select id="ae-type" className="input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="ADMIN">Admin (permissions below)</option>
            <option value="SUPER_ADMIN">Super admin (everything)</option>
          </select>
        </div>
        {role === "ADMIN" && (
          <div>
            <label className="label" htmlFor="ae-role">Role</label>
            <select id="ae-role" className="input" value={adminRoleId} onChange={(e) => setAdminRoleId(e.target.value)}>
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {role === "ADMIN" && (
        <>
          <fieldset>
            <legend className="label">Extra permissions (on top of the role)</legend>
            <PermissionPicker all={perms.filter((p) => !fromRole.includes(p.key))} value={grants} onChange={setGrants} idPrefix="ae-g" />
          </fieldset>
          {fromRole.length > 0 && (
            <fieldset>
              <legend className="label">Remove from this admin (role permissions)</legend>
              <PermissionPicker all={perms.filter((p) => fromRole.includes(p.key))} value={denials} onChange={setDenials} idPrefix="ae-d" />
            </fieldset>
          )}
        </>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-lime px-5 py-2.5 text-sm">Save access</button>
        {saved && (
          <span role="status" className="text-sm text-lime">
            Saved
          </span>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Change access"
        message="The new access applies to this admin's next page load."
        confirmLabel="Save"
        onClose={() => setConfirm(false)}
        onConfirm={async (password) => {
          const { error } = await send(`/api/admin/admins/${adminId}`, "PATCH", {
            action: "access",
            role,
            adminRoleId: role === "ADMIN" ? adminRoleId || null : null,
            permGrants: role === "ADMIN" ? grants.filter((g) => !fromRole.includes(g)) : [],
            permDenials: role === "ADMIN" ? denials.filter((d) => fromRole.includes(d)) : [],
            password,
          });
          if (error) return error;
          setConfirm(false);
          setSaved(true);
          router.refresh();
          return null;
        }}
      />
    </form>
  );
}

/** Super admin: suspend/reactivate an admin, or issue a password reset link. */
export function AdminActions({ adminId, email, status }: { adminId: string; email: string; status: string }) {
  const router = useRouter();
  const [action, setAction] = useState<"status" | "reset" | "remove" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const suspending = status === "ACTIVE";
  if (status === "CLOSED") return <p className="text-sm text-fog">This administrator has been removed. They can&apos;t sign in, and their access can&apos;t be changed.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAction("status")} className={`btn px-4 py-2 text-sm ${suspending ? "border border-danger/50 text-danger hover:bg-danger/10" : "btn-lime"}`}>
          {suspending ? "Suspend access" : "Reactivate"}
        </button>
        <button type="button" onClick={() => setAction("reset")} className="btn-ghost px-4 py-2 text-sm">
          Reset password link
        </button>
        <button type="button" onClick={() => setAction("remove")} className="btn border border-danger/50 px-4 py-2 text-sm text-danger hover:bg-danger/10">
          Remove admin
        </button>
      </div>
      {link && (
        <div role="status" className="space-y-1">
          <p className="text-sm text-white">Single-use reset link (24 hours, shown once). They have been signed out.</p>
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="input font-mono text-xs" aria-label="Reset link" />
        </div>
      )}
      <ConfirmDialog
        open={action === "status"}
        danger={suspending}
        title={suspending ? "Suspend administrator" : "Reactivate administrator"}
        message={
          suspending ? (
            <>
              <b className="text-white">{email}</b> is signed out everywhere and can&apos;t sign in. Users they referred stay attributed to them.
            </>
          ) : (
            <>
              <b className="text-white">{email}</b> can sign in again with their current access.
            </>
          )
        }
        confirmLabel={suspending ? "Suspend" : "Reactivate"}
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error } = await send(`/api/admin/admins/${adminId}`, "PATCH", { action: "status", status: suspending ? "SUSPENDED" : "ACTIVE", password });
          if (error) return error;
          setAction(null);
          router.refresh();
          return null;
        }}
      />
      <ConfirmDialog
        open={action === "remove"}
        danger
        title="Remove administrator"
        message={
          <>
            <b className="text-white">{email}</b> loses all admin access for good: signed out everywhere, can&apos;t sign in, their links and invites stop working and they leave
            the roster. Their history, referred users and audit trail are kept. This can&apos;t be undone.
          </>
        }
        confirmLabel="Remove"
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error } = await send(`/api/admin/admins/${adminId}`, "PATCH", { action: "remove", password });
          if (error) return error;
          setAction(null);
          router.push("/admin/admins");
          router.refresh();
          return null;
        }}
      />
      <ConfirmDialog
        open={action === "reset"}
        title="Reset password"
        message={
          <>
            Creates a new single-use link for <b className="text-white">{email}</b> to choose a password. Their current sessions and any older links stop working.
          </>
        }
        confirmLabel="Create link"
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error, data } = await send(`/api/admin/admins/${adminId}`, "PATCH", { action: "reset", password });
          if (error) return error;
          setAction(null);
          setLink(String(data.resetUrl));
          return null;
        }}
      />
    </div>
  );
}

/** Super admin: create, edit or delete a custom role. */
export function RoleEditor({ perms, role }: { perms: PermInfo[]; role?: RoleInfo & { description: string | null } }) {
  const router = useRouter();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [chosen, setChosen] = useState<string[]>(role?.permissions ?? []);
  const [action, setAction] = useState<"save" | "delete" | null>(null);
  const idp = role ? `re-${role.id}` : "re-new";
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setAction("save");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${idp}-name`}>Role name</label>
          <input id={`${idp}-name`} required minLength={2} maxLength={40} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-desc`}>Description</label>
          <input id={`${idp}-desc`} maxLength={160} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <fieldset>
        <legend className="label">Permissions</legend>
        <PermissionPicker all={perms} value={chosen} onChange={setChosen} idPrefix={idp} />
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button className="btn-lime px-5 py-2.5 text-sm">{role ? "Save role" : "Create role"}</button>
        {role && (
          <button type="button" onClick={() => setAction("delete")} className="btn border border-danger/50 px-4 py-2 text-sm text-danger hover:bg-danger/10">
            Delete
          </button>
        )}
      </div>
      <ConfirmDialog
        open={action !== null}
        danger={action === "delete"}
        title={action === "delete" ? `Delete role "${role?.name}"` : role ? "Save role" : "Create role"}
        message={action === "delete" ? "Only possible when no admin has this role." : "Admins with this role get the new permissions on their next page load."}
        confirmLabel={action === "delete" ? "Delete" : "Save"}
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error } =
            action === "delete"
              ? await send(`/api/admin/roles/${role!.id}`, "DELETE", { password })
              : await send(role ? `/api/admin/roles/${role.id}` : "/api/admin/roles", role ? "PATCH" : "POST", { name, description: description || undefined, permissions: chosen, password });
          if (error) return error;
          setAction(null);
          if (!role) {
            setName("");
            setDescription("");
            setChosen([]);
          }
          router.refresh();
          return null;
        }}
      />
    </form>
  );
}

/** Staff actions on a player: suspend/reactivate (users.suspend), balance correction (wallets.adjust). */
/**
 * Credit or debit an account's cash: pick the direction, enter a positive amount and a reason, then
 * confirm with your password. Posted as a ledger adjustment with an idempotency key (a double click
 * can't post twice) and written to the audit log. A debit can't take the balance below zero.
 */
function BalanceAdjust({ url, extra = {}, email, idPrefix }: { url: string; extra?: Record<string, unknown>; email: string; idPrefix: string }) {
  const router = useRouter();
  const [dir, setDir] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newId);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const value = /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Number(amount) : 0;
  const valid = value > 0 && value <= 100_000 && reason.trim().length >= 5;
  const ghsText = `GHS ${value.toFixed(2)}`;
  return (
    <div className="space-y-2">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setOpen(true);
        }}
      >
        <div role="radiogroup" aria-label="Credit or debit" className="grid grid-cols-2 rounded-lg bg-ink-800 p-1 text-sm font-semibold">
          {(["credit", "debit"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={dir === d}
              onClick={() => setDir(d)}
              className={`rounded-md py-1.5 transition ${dir === d ? (d === "credit" ? "bg-lime text-lime-ink" : "bg-danger text-white") : "text-fog hover:text-white"}`}
            >
              {d === "credit" ? "Credit (add)" : "Debit (remove)"}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <div>
            <label className="label" htmlFor={`${idPrefix}-amount`}>Amount (GHS)</label>
            <input id={`${idPrefix}-amount`} required inputMode="decimal" placeholder="0.00" className="input tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div>
            <label className="label" htmlFor={`${idPrefix}-reason`}>Reason</label>
            <input id={`${idPrefix}-reason`} required minLength={5} maxLength={300} placeholder="At least 5 characters" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <button disabled={!valid} className={`px-4 py-2 text-sm ${dir === "credit" ? "btn-lime" : "btn border border-danger/50 text-danger hover:bg-danger/10"}`}>
          {dir === "credit" ? "Credit" : "Debit"} {value > 0 ? ghsText : "balance"}
        </button>
      </form>
      {done && (
        <p role="status" className="text-sm text-lime">
          {done}
        </p>
      )}
      <ConfirmDialog
        open={open}
        danger={dir === "debit"}
        title={dir === "credit" ? "Credit balance" : "Debit balance"}
        message={
          <>
            {dir === "credit" ? "Add" : "Remove"} <b className="text-white">{ghsText}</b> {dir === "credit" ? "to" : "from"} {email}&apos;s balance. It&apos;s recorded in the ledger and audit log
            and can&apos;t be edited; a mistake needs an opposite adjustment.
          </>
        }
        confirmLabel={dir === "credit" ? "Credit" : "Debit"}
        onClose={() => setOpen(false)}
        onConfirm={async (password) => {
          const { error } = await send(url, "POST", { ...extra, amountGhs: dir === "credit" ? value : -value, reason: reason.trim(), idempotencyKey: key, password });
          if (error) return error;
          setOpen(false);
          setKey(newId()); // the next adjustment is a new one
          setAmount("");
          setReason("");
          setDone(`${dir === "credit" ? "Credited" : "Debited"} ${ghsText}`);
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

export function PlayerActions({
  playerId,
  email,
  status,
  canSuspend,
  canAdjust,
  canVerify,
  verified,
}: {
  playerId: string;
  email: string;
  status: string;
  canSuspend: boolean;
  canAdjust: boolean;
  canVerify: boolean;
  verified: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"status" | "verify" | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const suspending = status === "ACTIVE";
  return (
    <div className="space-y-4">
      {canSuspend && (
        <button type="button" onClick={() => { setReason(""); setAction("status"); }} className={`btn px-4 py-2 text-sm ${suspending ? "border border-danger/50 text-danger hover:bg-danger/10" : "btn-lime"}`}>
          {suspending ? "Suspend user" : "Reactivate user"}
        </button>
      )}
      {canVerify && !verified && (
        <button type="button" onClick={() => setAction("verify")} className="btn-lime px-4 py-2 text-sm">
          Verify account
        </button>
      )}
      {canAdjust && <BalanceAdjust url={`/api/admin/players/${playerId}`} extra={{ action: "adjust" }} email={email} idPrefix="adj" />}
      {done && (
        <p role="status" className="text-sm text-lime">
          {done}
        </p>
      )}
      <ConfirmDialog
        open={action === "status"}
        danger={suspending}
        title={suspending ? "Suspend user" : "Reactivate user"}
        message={
          <div className="space-y-2">
            <p>
              <b className="text-white">{email}</b> {suspending ? "is signed out and can't sign in or bet." : "can sign in again."}
            </p>
            <label className="label" htmlFor="ps-reason">Reason</label>
            <input id="ps-reason" required minLength={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        }
        confirmLabel={suspending ? "Suspend" : "Reactivate"}
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error } = await send(`/api/admin/players/${playerId}`, "POST", { action: "status", status: suspending ? "SUSPENDED" : "ACTIVE", reason, password });
          if (error) return error;
          setAction(null);
          setDone(suspending ? "User suspended" : "User reactivated");
          router.refresh();
          return null;
        }}
      />
      <ConfirmDialog
        open={action === "verify"}
        title="Verify account"
        message={
          <>
            Mark <b className="text-white">{email}</b> as verified. They can then withdraw without the standard verification step. Any money held for verification is released to their balance. Recorded in the audit log.
          </>
        }
        confirmLabel="Verify"
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error } = await send(`/api/admin/players/${playerId}`, "POST", { action: "verify", password });
          if (error) return error;
          setAction(null);
          setDone("Account verified");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

/** Credit or debit an administrator's own cash balance. Password-confirmed, audited. */
export function AdminBalanceCredit({ adminId, email }: { adminId: string; email: string }) {
  return <BalanceAdjust url={`/api/admin/admins/${adminId}/balance`} email={email} idPrefix="ac" />;
}

/** Delete an admin account's settled financial history (the transaction-list rows). Any admin; balances and the ledger are left alone, pending items kept. */
export function AdminClearHistory({ adminId, email }: { adminId: string; email: string }) {
  const router = useRouter();
  const [withdrawals, setWithdrawals] = useState(true);
  const [deposits, setDeposits] = useState(false);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const directions = ([withdrawals && "WITHDRAWAL", deposits && "DEPOSIT"] as const).filter(Boolean) as ("WITHDRAWAL" | "DEPOSIT")[];
  const what = directions.length === 2 ? "withdrawals and deposits" : withdrawals ? "withdrawals" : "deposits";
  return (
    <div className="space-y-2">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setOpen(true); }}>
        <div className="flex flex-wrap gap-4 text-sm text-white">
          <label className="flex items-center gap-2"><input type="checkbox" checked={withdrawals} onChange={(e) => setWithdrawals(e.target.checked)} /> Withdrawals</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={deposits} onChange={(e) => setDeposits(e.target.checked)} /> Deposits</label>
        </div>
        <button disabled={directions.length === 0} className="btn px-4 py-2 text-sm bg-danger text-white hover:bg-danger/90 disabled:opacity-50">Clear history</button>
      </form>
      {done && <p role="status" className="text-sm text-lime">{done}</p>}
      <ConfirmDialog
        open={open}
        title="Clear financial history"
        danger
        message={
          <>
            Permanently delete {email}&apos;s settled {what} records. Balances and the ledger are untouched, and anything still pending is kept. This can&apos;t be undone.
          </>
        }
        confirmLabel="Clear history"
        onClose={() => setOpen(false)}
        onConfirm={async (password) => {
          const { error, data } = await send(`/api/admin/admins/${adminId}/clear-history`, "POST", { directions, password });
          if (error) return error;
          setOpen(false);
          const removed = Number(data.removed ?? 0);
          const kept = Number(data.keptPending ?? 0);
          setDone(`Removed ${removed} record${removed === 1 ? "" : "s"}${kept ? `, kept ${kept} pending` : ""}.`);
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
