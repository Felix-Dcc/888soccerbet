"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Re-authentication for sensitive admin actions: states exactly what will happen and asks for
 * the admin's password, which the server checks again. Esc or Cancel closes it.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (password: string) => Promise<string | null>; // resolves to an error message, or null on success
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Latest callbacks/state for the key handler, so the setup below runs only when the dialog opens
  // (callers pass new functions every render; re-running would wipe the password and steal focus).
  const live = useRef({ onClose, busy });
  live.current = { onClose, busy };

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError(null);
    setTimeout(() => input.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !live.current.busy && live.current.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  // Portalled to <body>: callers render this inside their own <form>, and forms can't nest.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <form
        className="card relative w-full max-w-md space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation(); // React bubbles portal events to the parent form; keep it from re-submitting
          setBusy(true);
          setError(await onConfirm(password));
          setBusy(false);
        }}
      >
        <h2 id="confirm-title" className="font-display text-lg font-bold text-white">
          {title}
        </h2>
        <div className="text-sm text-fog">{message}</div>
        <div>
          <label htmlFor="confirm-password" className="label">
            Your password
          </label>
          <input
            ref={input}
            id="confirm-password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
            Cancel
          </button>
          <button disabled={busy || !password} className={`btn px-4 py-2 text-sm ${danger ? "bg-danger text-white hover:bg-danger/90" : "btn-lime"}`}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** POST/PATCH JSON and return the server's error message (or null on success) plus the body. */
export async function send(url: string, method: string, body: unknown): Promise<{ error: string | null; data: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: r.ok ? null : String(data.error ?? "Something went wrong"), data };
  } catch {
    return { error: "Network error — try again", data: {} };
  }
}
