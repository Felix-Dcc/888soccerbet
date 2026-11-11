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
export const payRef = (dir: "DEP" | "WDR" | "VER" | "NTT") => `${dir}-${code(8)}`;
export const referralCode = () => code(8);
/** `len` symbols always mixing letters and numbers; a draw that is all one kind is redrawn. */
function mixedCode(len: number): string {
  for (;;) {
    const c = code(len);
    if (/[0-9]/.test(c) && /[A-Z]/.test(c)) return c;
  }
}
/** Booking code: exactly 6 characters, always mixing letters and numbers (e.g. "K7MQ2C"). */
export const bookingCode = () => mixedCode(6);
/** An administrator's referral code: 8 characters mixing letters and numbers (e.g. "AE9MC1PK"). Shared publicly, so nothing about the admin is in it. */
export const adminReferralCode = () => mixedCode(8);
/** Codes are typed by hand; accept any case and stray spaces/dashes. */
export const normaliseCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "");
