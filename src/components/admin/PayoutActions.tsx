"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, send } from "./ConfirmDialog";

/**
 * Paid / Failed for one hand-paid withdrawal. Both re-ask the admin's password.
 * to: number and network, or bank and account number. naira: what to send a Nigerian player (null for Ghana).
 */
export function PayoutActions({ refCode, amount, to, naira, accountName }: { refCode: string; amount: string; to: string; naira?: string | null; accountName?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<"PAID" | "FAILED" | null>(null);
  const record = async (password: string) => {
    const { error } = await send("/api/admin/payouts", "POST", { ref: refCode, outcome: open, password });
    if (!error) router.refresh();
    return error;
  };
  return (
    <>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen("PAID")} className="inline-flex h-8 items-center rounded-xl bg-lime px-3 text-xs font-bold text-lime-ink hover:bg-lime-600">
          Paid
        </button>
        <button type="button" onClick={() => setOpen("FAILED")} className="inline-flex h-8 items-center rounded-xl border border-danger/50 px-3 text-xs font-semibold text-danger hover:bg-danger/10">
          Failed
        </button>
      </div>
      <ConfirmDialog
        open={open !== null}
        title={open === "PAID" ? "Mark as paid" : "Mark as failed"}
        confirmLabel={open === "PAID" ? "Mark paid" : "Mark failed"}
        danger={open === "FAILED"}
        message={
          open === "PAID" ? (
            <>
              Only after you have sent {naira ? <><strong>{naira}</strong> (GHS {amount})</> : <strong>GHS {amount}</strong>} to <strong>{to}</strong>
              {accountName ? <> ({accountName})</> : null}. The player is emailed that it&apos;s paid.
            </>
          ) : (
            <>
              <strong>GHS {amount}</strong> goes back to the user&apos;s balance. Only if the money was <strong>not</strong> sent.
            </>
          )
        }
        onConfirm={record}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
