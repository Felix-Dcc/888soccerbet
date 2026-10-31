"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { newId } from "@/lib/clientId";
import { ConfirmDialog, send } from "./ConfirmDialog";

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
  const [f, setF] = useState({ email: "", displayName: "", username: "", role: "ADMIN" as "ADMIN" | "SUPER_ADMIN", adminRoleId: "" });
  const [grants, setGrants] = useState<string[]>(["dashboard.view", "referrals.view"]);
  const [confirm, setConfirm] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (link)
    return (
      <div role="status" className="space-y-3">
        <p className="text-sm text-white">Admin created. Send them this single-use link to set their password (it expires in 72 hours and is shown only once):</p>
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="input font-mono text-xs" aria-label="Setup link" />
        <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => { setLink(null); setF({ email: "", displayName: "", username: "", role: "ADMIN", adminRoleId: "" }); }}>
          Create another
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
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="na-name">Name</label>
          <input id="na-name" required minLength={2} maxLength={60} className="input" value={f.displayName} onChange={set("displayName")} />
        </div>
        <div>
          <label className="label" htmlFor="na-user">Username</label>
          <input id="na-user" required pattern="[A-Za-z0-9_.\-]{3,24}" title="3-24 letters, numbers, . _ -" className="input" value={f.username} onChange={set("username")} />
        </div>
        <div>
          <label className="label" htmlFor="na-email">Email</label>
          <input id="na-email" type="email" required className="input" value={f.email} onChange={set("email")} />
        </div>
      </div>
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
      <button className="btn-lime px-5 py-2.5 text-sm">Create admin</button>
      <ConfirmDialog
        open={confirm}
        title="Create administrator"
        message={
          <>
            Create <b className="text-white">{f.email}</b> as {f.role === "SUPER_ADMIN" ? "a super admin with full access" : "an admin"}?
          </>
        }
        confirmLabel="Create"
        onClose={() => setConfirm(false)}
        onConfirm={async (password) => {
          const { error, data } = await send("/api/admin/admins", "POST", {
            ...f,
            adminRoleId: f.adminRoleId || null,
            permGrants: f.role === "ADMIN" ? grants : [],
            password,
          });
          if (error) return error;
          setConfirm(false);
          setLink(String(data.setupUrl));
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
  const [action, setAction] = useState<"status" | "reset" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const suspending = status === "ACTIVE";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAction("status")} className={`btn px-4 py-2 text-sm ${suspending ? "border border-danger/50 text-danger hover:bg-danger/10" : "btn-lime"}`}>
          {suspending ? "Suspend access" : "Reactivate"}
        </button>
        <button type="button" onClick={() => setAction("reset")} className="btn-ghost px-4 py-2 text-sm">
          Reset password link
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
  const [action, setAction] = useState<"status" | "adjust" | "verify" | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(newId);
  const [done, setDone] = useState<string | null>(null);
  const suspending = status === "ACTIVE";
  const amountNum = Number(amount);
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
      {canAdjust && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAction("adjust");
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div>
              <label className="label" htmlFor="adj-amount">Amount (GHS, minus to debit)</label>
              <input id="adj-amount" required inputMode="decimal" pattern="-?\d+(\.\d{1,2})?" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="adj-reason">Reason</label>
              <input id="adj-reason" required minLength={5} maxLength={300} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <button disabled={!amountNum} className="btn-ghost px-4 py-2 text-sm">
            Post balance correction
          </button>
        </form>
      )}
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
        open={action === "adjust"}
        title="Post balance correction"
        message={
          <>
            {amountNum > 0 ? "Credit" : "Debit"} <b className="text-white">GHS {Math.abs(amountNum).toFixed(2)}</b> {amountNum > 0 ? "to" : "from"} {email}. This is recorded in the ledger and audit log and can&apos;t be edited; a mistake needs an opposite correction.
          </>
        }
        confirmLabel="Post correction"
        onClose={() => setAction(null)}
        onConfirm={async (password) => {
          const { error } = await send(`/api/admin/players/${playerId}`, "POST", { action: "adjust", amountGhs: amountNum, reason, idempotencyKey: key, password });
          if (error) return error;
          setAction(null);
          setKey(newId()); // next correction is a new one
          setAmount("");
          setReason("");
          setDone("Correction posted");
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

/** Credit (or debit, with a minus) an administrator's own cash balance. Password-confirmed, audited. */
export function AdminBalanceCredit({ adminId, email }: { adminId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newId);
  const [done, setDone] = useState<string | null>(null);
  const amountNum = Number(amount);
  return (
    <div className="space-y-2">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <div>
            <label className="label" htmlFor="ac-amount">Amount (GHS, minus to debit)</label>
            <input id="ac-amount" required inputMode="decimal" pattern="-?\d+(\.\d{1,2})?" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ac-reason">Reason</label>
            <input id="ac-reason" required minLength={5} maxLength={300} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <button disabled={!amountNum} className="btn-lime px-4 py-2 text-sm">
          {amountNum < 0 ? "Debit balance" : "Credit balance"}
        </button>
      </form>
      {done && (
        <p role="status" className="text-sm text-lime">
          {done}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title={amountNum < 0 ? "Debit balance" : "Credit balance"}
        message={
          <>
            {amountNum > 0 ? "Credit" : "Debit"} <b className="text-white">GHS {Math.abs(amountNum).toFixed(2)}</b> {amountNum > 0 ? "to" : "from"} {email}. Recorded in the ledger and audit log and can&apos;t be edited; a mistake needs an opposite correction.
          </>
        }
        confirmLabel={amountNum < 0 ? "Debit" : "Credit"}
        onClose={() => setOpen(false)}
        onConfirm={async (password) => {
          const { error } = await send(`/api/admin/admins/${adminId}/balance`, "POST", { amountGhs: amountNum, reason, idempotencyKey: key, password });
          if (error) return error;
          setOpen(false);
          setKey(newId());
          setAmount("");
          setReason("");
          setDone("Balance updated");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
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
