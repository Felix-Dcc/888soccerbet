/**
 * Exact money + odds math. All amounts are integer pesewas (bigint). All odds are
 * integer milli-odds (2.50 => 2500). No floats touch a balance or a payout.
 */

export const MILLI = 1000n;

/** GHS major units (number|string) -> pesewas (bigint). Rounds to the nearest pesewa. */
export function toPesewas(ghs: number | string): bigint {
  const s = typeof ghs === "number" ? ghs.toFixed(4) : ghs.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: ${ghs}`);
  const neg = s.startsWith("-");
  const parts = s.replace("-", "").split(".");
  const whole = parts[0] || "0";
  const frac = parts[1] ?? "";
  const cents = (frac + "00").slice(0, 2);
  const roundUp = frac.length > 2 && Number(frac[2] ?? "0") >= 5 ? 1n : 0n;
  const value = BigInt(whole) * 100n + BigInt(cents) + roundUp;
  return neg ? -value : value;
}

/** pesewas (bigint) -> "1,234.50" */
export function formatPesewas(p: bigint): string {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const whole = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${cents}`;
}

export const formatGHS = (p: bigint): string => `GHS ${formatPesewas(p)}`;

/** Decimal odds (e.g. 2.5) -> milli-odds (2500). */
export function toMilliOdds(odds: number | string): number {
  const n = typeof odds === "string" ? Number(odds) : odds;
  if (!Number.isFinite(n) || n < 1) throw new Error(`invalid odds: ${odds}`);
  return Math.round(n * 1000);
}

/** milli-odds -> "2.50" */
export function formatMilliOdds(m: number): string {
  return (m / 1000).toFixed(2);
}

/**
 * Combined milli-odds for an accumulator = product of decimal odds, back to milli.
 * Computed in bigint to stay exact for long accas, then rounded once at the end.
 */
export function combineMilliOdds(legs: number[]): number {
  if (legs.length === 0) throw new Error("no legs");
  let num = 1n; // running product of milli-odds
  for (const m of legs) {
    if (!Number.isInteger(m) || m < 1000) throw new Error(`invalid leg odds: ${m}`);
    num *= BigInt(m);
  }
  // num has MILLI^legs scaling; bring back to a single MILLI scale with half-up rounding.
  const scale = MILLI ** BigInt(legs.length - 1);
  const rounded = (num + scale / 2n) / scale;
  return Number(rounded);
}

/** Potential payout in pesewas = stake * combinedMilliOdds / 1000, floored (house-favourable). */
export function potentialPayout(stakePesewas: bigint, combinedMilli: number): bigint {
  return (stakePesewas * BigInt(combinedMilli)) / MILLI;
}
