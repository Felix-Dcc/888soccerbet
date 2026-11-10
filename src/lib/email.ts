/**
 * Transactional email through Brevo's API. Off when BREVO_API_KEY is unset (local dev, tests):
 * messages are logged instead of sent. Sending never throws: a failed email must not undo the
 * sign-up, payout or payment that triggered it.
 */
import { formatPesewas } from "./money";

const FROM = { name: process.env.EMAIL_FROM_NAME || "Bet Zone", email: process.env.EMAIL_FROM || "no-reply@betzone.com.co" };
const appUrl = () => (process.env.APP_URL || "https://betzone.com.co").replace(/\/+$/, "");

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(m: Email): Promise<boolean> {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "test") console.info(`[email] (not sent, no BREVO_API_KEY) to=${m.to} subject="${m.subject}"`);
    return false;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: FROM, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[email] Brevo ${res.status} for "${m.subject}": ${(await res.text()).slice(0, 300)}`);
    return res.ok;
  } catch (e) {
    console.error(`[email] send failed for "${m.subject}":`, e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** One branded layout for every message: dark green bar, white card, plain footer. */
function layout(title: string, body: string, cta?: { label: string; href: string }) {
  const button = cta
    ? `<p style="margin:28px 0 8px"><a href="${esc(cta.href)}" style="display:inline-block;background:#16A34A;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:10px">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#EEF1F4;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#FFFFFF;border-bottom:3px solid #00A01B;padding:18px 24px;font-size:20px;font-weight:800;color:#040C06">Bet Zone <span style="color:#00A01B;font-size:10px;letter-spacing:3px;font-weight:800">SPORTSBOOK</span></td></tr>
<tr><td style="padding:28px 24px 8px"><h1 style="margin:0 0 14px;font-size:22px">${esc(title)}</h1>${body}${button}</td></tr>
<tr><td style="padding:18px 24px 24px;font-size:12px;color:#6B7280">You're getting this because of activity on your Bet Zone account. 18+ only. Play responsibly.<br>${esc(appUrl())}</td></tr>
</table></td></tr></table></body></html>`;
}
const p = (s: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${s}</p>`;
const ghs = (pesewas: bigint) => `GHS ${formatPesewas(pesewas)}`;

export const emails = {
  verifyCode(to: string, code: string): Email {
    return {
      to,
      subject: `${code} is your Bet Zone code`,
      html: layout(
        "Confirm your email",
        p("Enter this code on Bet Zone to confirm your email address:") +
          `<p style="margin:18px 0;font-size:34px;font-weight:800;letter-spacing:8px">${esc(code)}</p>` +
          p("It expires in 30 minutes. If you didn't create an account, you can ignore this email."),
        { label: "Enter code", href: `${appUrl()}/verify-email` },
      ),
      text: `Your Bet Zone code is ${code}. Enter it at ${appUrl()}/verify-email. It expires in 30 minutes. If you didn't create an account, ignore this email.`,
    };
  },

  passwordReset(to: string, link: string): Email {
    return {
      to,
      subject: "Reset your Bet Zone password",
      html: layout(
        "Reset your password",
        p("Someone asked to reset the password on your Bet Zone account. Use the button below to choose a new one.") +
          p("The link works once and expires in 30 minutes. If this wasn't you, ignore this email: your password stays the same."),
        { label: "Choose a new password", href: link },
      ),
      text: `Reset your Bet Zone password: ${link}\nThe link works once and expires in 30 minutes. If this wasn't you, ignore this email.`,
    };
  },

  win(to: string, payout: bigint, ref: string): Email {
    return {
      to,
      subject: `You won ${ghs(payout)} on Bet Zone`,
      html: layout(
        "You won!",
        p(`Your ticket <strong>${esc(ref)}</strong> won. <strong>${esc(ghs(payout))}</strong> has been added to your balance.`),
        { label: "View ticket", href: `${appUrl()}/bets` },
      ),
      text: `Your ticket ${ref} won. ${ghs(payout)} has been added to your Bet Zone balance. ${appUrl()}/bets`,
    };
  },

  deposit(to: string, amount: bigint, ref: string): Email {
    return {
      to,
      subject: `Deposit received: ${ghs(amount)}`,
      html: layout("Deposit received", p(`<strong>${esc(ghs(amount))}</strong> is now in your Bet Zone balance.`) + p(`Reference: ${esc(ref)}`), { label: "Open wallet", href: `${appUrl()}/wallet` }),
      text: `${ghs(amount)} is now in your Bet Zone balance. Reference: ${ref}. ${appUrl()}/wallet`,
    };
  },

  withdrawal(to: string, amount: bigint, ref: string): Email {
    return {
      to,
      subject: `Withdrawal paid: ${ghs(amount)}`,
      html: layout(
        "Withdrawal paid",
        p(`We've sent <strong>${esc(ghs(amount))}</strong> to your mobile money account.`) + p(`Reference: ${esc(ref)}`) + p("If you didn't ask for this, contact support straight away."),
        { label: "Open wallet", href: `${appUrl()}/wallet` },
      ),
      text: `We've sent ${ghs(amount)} to your mobile money account. Reference: ${ref}. If you didn't ask for this, contact support straight away.`,
    };
  },
};

export const resetLink = (token: string) => `${appUrl()}/account/setup/${token}`;
