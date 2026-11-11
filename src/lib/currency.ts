/**
 * What a player sees money in. Every balance and amount is stored in GHS pesewas; Nigerian players
 * see and type them in Naira at the admin's ngnPerGhs rate (1 pesewa = rate kobo, exactly).
 * Safe to import in the browser.
 */
import { formatPesewas, toPesewas } from "./money";

export type Currency = { code: "GHS" } | { code: "NGN"; rate: number };
export const GHS_CURRENCY: Currency = { code: "GHS" };

const isNgn = (c: Currency): c is { code: "NGN"; rate: number } => c.code === "NGN" && Number.isInteger(c.rate) && c.rate > 0;

/** The label before an amount: "GHS" or "₦". */
export const unitOf = (c: Currency) => (isNgn(c) ? "₦" : "GHS");

/** pesewas -> "1,234.50" in the player's currency (no label). */
export function amountIn(c: Currency, pesewas: bigint): string {
  return formatPesewas(isNgn(c) ? pesewas * BigInt(c.rate) : pesewas);
}

/** pesewas -> "GHS 1,234.50" or "₦160,485.00". */
export const moneyIn = (c: Currency, pesewas: bigint) => (isNgn(c) ? `₦${amountIn(c, pesewas)}` : `GHS ${amountIn(c, pesewas)}`);

/** pesewas -> a plain number in the player's currency, for number inputs and quick-pick values. */
export const numberIn = (c: Currency, pesewas: bigint) => Number(isNgn(c) ? pesewas * BigInt(c.rate) : pesewas) / 100;

/**
 * A typed amount in the player's currency -> pesewas. Naira is converted at the rate to the nearest
 * pesewa, so it can be a fraction of the rate's kobo off (₦10,000 at 130 is GHS 76.92 = ₦9,999.60).
 * Throws on anything that isn't a plain number.
 */
export function pesewasFrom(c: Currency, typed: number | string): bigint {
  const minor = toPesewas(typed);
  if (!isNgn(c)) return minor;
  const rate = BigInt(c.rate);
  const half = minor < 0n ? -rate / 2n : rate / 2n;
  return (minor + half) / rate;
}

/** pesewas -> the GHS number the API's amountGhs / stakeGhs fields take (exact: two decimals). */
export const ghsNumber = (pesewas: bigint) => Number(pesewas) / 100;

/** Rewrites GHS amounts in a server message ("Minimum stake is 250 GHS", "GHS 1.00") into the player's currency. */
export function localizeMessage(c: Currency, text: string): string {
  if (!isNgn(c)) return text;
  return text.replace(/GHS\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?GHS\b/g, (_m, a: string | undefined, b: string | undefined) =>
    moneyIn(c, toPesewas((a ?? b ?? "0").replace(/,/g, ""))),
  );
}
