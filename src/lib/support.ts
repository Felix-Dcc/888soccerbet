/**
 * The Telegram support setting (Platform Settings) as a link players can open. Accepts "@handle",
 * "handle", or a t.me / telegram.me link (including group invites, t.me/+code). Anything else gives
 * null, so a typo hides the link instead of sending players somewhere unexpected.
 */
export function telegramSupport(setting: string | null | undefined): { url: string; label: string } | null {
  const s = (setting ?? "").trim();
  const link = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/(\+?[A-Za-z0-9_-]+)\/?$/i);
  const handle = link?.[1] ?? s.replace(/^@/, "");
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(handle)) return { url: `https://t.me/${handle}`, label: `@${handle}` };
  if (link && handle.startsWith("+")) return { url: `https://t.me/${handle}`, label: "Telegram" };
  return null;
}

/** The support email players see everywhere: the admin's Email Support setting, else the legal default. */
export async function supportEmail(): Promise<string> {
  const [{ getPlatformSettings }, { legal }] = await Promise.all([import("./platformSettings"), import("./legal")]); // server-only; keeps this module importable in tests
  const set = await getPlatformSettings().then((x) => x.emailSupport.trim(), () => "");
  return set || legal().email;
}
