/**
 * The public address used in every link we hand out (referral, admin invite, password reset). Always
 * the configured APP_URL (production: https://betzone.com.co), never the address a page was opened
 * on, so a link made from the Railway domain or a preview still points at the real site.
 */
export const siteUrl = () => (process.env.APP_URL || "https://betzone.com.co").replace(/\/+$/, "");
