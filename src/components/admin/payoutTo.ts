import { formatNaira } from "@/lib/nigeria";

/** Where a hand-paid withdrawal goes, from its metadata: a Ghana mobile money number, or a Nigerian bank account with the Naira to send. */
export function payoutTo(metadata: unknown): { to: string; naira: string | null; name: string | null } {
  const m = (metadata ?? {}) as { msisdn?: string; network?: string; accountName?: string; bankName?: string; accountNumber?: string; ngn?: { kobo?: string } };
  if (m.bankName) {
    return { to: `${m.bankName} ${m.accountNumber ?? "?"}`, naira: m.ngn?.kobo ? formatNaira(BigInt(m.ngn.kobo)) : null, name: m.accountName ?? null };
  }
  return { to: `${m.msisdn ?? "?"} (${m.network ?? "?"})`, naira: null, name: m.accountName ?? null };
}
