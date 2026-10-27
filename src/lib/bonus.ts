/**
 * Multiple bonus: a percentage added to the return of an accumulator that wins in full, shown as
 * "Max Bonus" on the betslip and "Total Bonus" on the ticket.
 *
 * Only legs priced at BONUS_MIN_ODDS or better count towards the number that sets the percentage;
 * a shorter leg still pays its odds, it just earns no bonus. Settlement counts the legs that won,
 * so a multiple cut down by voids earns the smaller bonus (or none).
 *
 * The house pays it on top of the odds payout, so it is a marketing cost and never the player's
 * own stake coming back. BONUS_TABLE sets the rates as "legs:percent" pairs; the highest entry at
 * or below the qualifying leg count applies. An empty table turns the bonus off everywhere.
 */

/** "legs:percent" pairs. The default is anchored on 6% for five legs and rises from there. */
const DEFAULT_TABLE = "3:3,4:5,5:6,6:8,7:11,8:15,9:20,10:25,12:35,15:50,20:70";
const DEFAULT_MIN_ODDS = 1.2;

export interface BonusRules {
  minMilliOdds: number;
  /** [legs, percent], ascending by legs. */
  table: [number, number][];
}

/** The configured rules, for the engine and for handing to the betslip (which runs in the browser). */
export function bonusRules(): BonusRules {
  const minOdds = Number(process.env.BONUS_MIN_ODDS ?? DEFAULT_MIN_ODDS);
  const raw = process.env.BONUS_TABLE ?? DEFAULT_TABLE;
  const table = raw
    .split(",")
    .map((pair) => pair.split(":").map((n) => Number(n.trim())) as [number, number])
    .filter(([legs, pct]) => Number.isInteger(legs) && legs > 1 && Number.isFinite(pct) && pct > 0)
    .sort((a, b) => a[0] - b[0]);
  return { minMilliOdds: Number.isFinite(minOdds) && minOdds >= 1 ? Math.round(minOdds * 1000) : Math.round(DEFAULT_MIN_ODDS * 1000), table };
}

/** How many of these legs are priced high enough to earn bonus. */
export const qualifyingLegs = (milliOdds: number[], rules: BonusRules): number => milliOdds.filter((m) => m >= rules.minMilliOdds).length;

/** The percentage for a leg count: the highest entry at or below it, else 0. */
export function bonusPercent(legs: number, rules: BonusRules): number {
  let pct = 0;
  for (const [at, p] of rules.table) if (legs >= at) pct = p;
  return pct;
}

/**
 * The bonus on a winning multiple, in pesewas. Floored, like every other payout here, so rounding
 * never runs against the house. `payout` is the odds return (stake x combined odds).
 */
export function multipleBonus(payout: bigint, milliOdds: number[], rules: BonusRules = bonusRules()): bigint {
  const pct = bonusPercent(qualifyingLegs(milliOdds, rules), rules);
  return pct > 0 ? (payout * BigInt(pct)) / 100n : 0n;
}
