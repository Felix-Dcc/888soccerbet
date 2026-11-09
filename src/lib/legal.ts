/**
 * Facts the legal pages state about the operator. Set them in .env before launch; until then
 * the pages say plainly what is missing instead of inventing a company, address or licence.
 * Bump TERMS_VERSION (a date) whenever the Terms or Privacy Policy change materially: sign-ups
 * record which version they accepted.
 */
export const TERMS_VERSION = "2026-10-25";

const or = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

export const legal = () => ({
  operator: or(process.env.LEGAL_ENTITY, "Bet Zone (operating company not yet registered)"),
  address: or(process.env.LEGAL_ADDRESS, "Registered address to be published before launch"),
  email: or(process.env.LEGAL_EMAIL, "support@888soccerbet.com"),
  // Gaming Commission of Ghana licence; none yet: the site runs as a sandbox with no real money.
  licence: process.env.GAMING_LICENCE?.trim() || null,
  // Registration with Ghana's Data Protection Commission (Data Protection Act, 2012 (Act 843)).
  dpcRegistration: process.env.DPC_REGISTRATION?.trim() || null,
});
