/**
 * Kick-off formatting in one fixed zone so the server render and the browser agree
 * (Ghana by default; configurable). Browser-safe.
 */
const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Africa/Accra";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const longFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function kickoffDay(iso: string, now: Date = new Date()): string {
  const k = dayKey.format(new Date(iso));
  if (k === dayKey.format(now)) return "Today";
  if (k === dayKey.format(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return dayLabel.format(new Date(iso));
}
export const kickoffTime = (iso: string) => timeFmt.format(new Date(iso));
export const kickoffLong = (iso: string) => longFmt.format(new Date(iso));

const stampDate = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
/** "24/10/2026 00:42" — when a slip was booked. */
export const formatStamp = (d: Date) => `${stampDate.format(d)} ${timeFmt.format(d)}`;
