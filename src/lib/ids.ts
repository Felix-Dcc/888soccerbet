import { randomBytes } from "node:crypto";

const ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ2345679"; // no ambiguous chars

function code(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export const betRef = () => `SB-${code(6)}`;
/** Public ticket verification code: "SB" + 14 random symbols (~68 bits), so it can't be guessed. Older tickets keep their "KB" codes. */
export const verifyCode = () => `SB${code(14)}`;
export const payRef = (dir: "DEP" | "WDR" | "VER") => `${dir}-${code(8)}`;
export const referralCode = () => code(8);
/** Booking code: exactly 6 characters, always mixing letters and numbers (e.g. "K7MQ2C"). */
export function bookingCode(): string {
  for (;;) {
    const c = code(6); // about 1 in 5 draws is all letters (or all numbers): draw again
    if (/[0-9]/.test(c) && /[A-Z]/.test(c)) return c;
  }
}
/** Codes are typed by hand; accept any case and stray spaces/dashes. */
export const normaliseCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "");
