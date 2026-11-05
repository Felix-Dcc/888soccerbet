/**
 * When to ask the feed for a finished match's result: at these ages (hours after kick-off).
 * Early checks catch the usual case soon after full time; the spaced-out later ones catch a feed
 * that is slow to mark a match completed, without spending credits every run on a match that never
 * finishes (postponed, abandoned). The last stays well inside the feed's 3-day results window.
 */
export const RESULT_CHECK_HOURS = [2, 2.5, 3, 4, 6, 12, 24, 48] as const;

const H = 60 * 60 * 1000;

/**
 * True when a run every `everyMs` should check a match `ageMs` after its kick-off: exactly one run
 * falls in each [check age, check age + everyMs) window, so each check age fires once.
 */
export function resultCheckDue(ageMs: number, everyMs: number): boolean {
  return RESULT_CHECK_HOURS.some((h) => ageMs >= h * H && ageMs < h * H + everyMs);
}
