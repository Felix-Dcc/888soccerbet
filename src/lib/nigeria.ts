/**
 * Nigerian players. Their balance is in GHS like everyone's; they pay in Naira on Flutterwave's
 * checkout, converted at the admin's ngnPerGhs rate, and their withdrawals are paid by an admin
 * to a Nigerian bank account. Safe to import in the browser.
 */
import { formatPesewas } from "./money";

export type Country = "GH" | "NG";
export const COUNTRY_NAME: Record<Country, string> = { GH: "Ghana", NG: "Nigeria" };

/** Withdrawals of Nigerian players: always paid by hand to a bank account. */
export const NG_BANK_PROVIDER = "ng_bank";

/** GHS pesewas -> kobo at ngnPerGhs Naira per GHS. Exact: one pesewa is ngnPerGhs kobo. */
export function toKobo(pesewas: bigint, ngnPerGhs: number): bigint {
  if (!Number.isInteger(ngnPerGhs) || ngnPerGhs <= 0) throw new Error("no Naira rate set");
  return pesewas * BigInt(ngnPerGhs);
}

/** kobo -> "₦12,345.00" */
export const formatNaira = (kobo: bigint) => `₦${formatPesewas(kobo)}`;
