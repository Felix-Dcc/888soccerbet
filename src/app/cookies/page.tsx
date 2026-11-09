import type { Metadata } from "next";
import { LegalPage, LegalTable } from "@/components/LegalPage";
import { legal } from "@/lib/legal";

export const dynamic = "force-dynamic"; // states the live operator settings
export const metadata: Metadata = { title: "Cookies Policy — Bet Zone" };

/**
 * Everything the site stores on a device. All of it is strictly necessary or a choice the player
 * makes, which is why there is no consent banner. Adding analytics, ads or any third-party script
 * would change that: update this page and ask for consent first. (Turnstile on log-in/sign-up is a
 * security check, so it needs no consent.)
 */
export default function CookiesPage() {
  const l = legal();
  return (
    <LegalPage title="Cookies Policy" path="/cookies">
      <h2>What we store on your device</h2>
      <LegalTable
        head={["Name", "What it does", "How long"]}
        rows={[
          ["stk_session (cookie)", "Keeps you signed in. Strictly necessary; scripts can't read it.", "14 days, or until you close the browser if you don't tick Remember me"],
          ["sb.betslip.v1 (local storage)", "Remembers the selections and stake on your betslip.", "Until you clear your betslip or browser data"],
          ["kb.hideBalance (local storage)", "Remembers whether you hid your balance.", "Until you change it or clear browser data"],
          ["kb.splash (session storage)", "Plays the opening animation once per visit.", "Until you close the tab"],
        ]}
      />

      <h2>What we don&apos;t use</h2>
      <p>
        No analytics, advertising or tracking cookies, and no third-party cookies. Team badges and photos are served from our own server, so other sites
        can&apos;t see your visit. The only outside script is Cloudflare Turnstile, on the log-in and sign-up pages, which checks you aren&apos;t a bot; it
        doesn&apos;t track you across sites.
      </p>

      <h2>Why there is no cookie banner</h2>
      <p>
        Everything above is either needed for the site to work (staying signed in) or remembers a choice you made, so it doesn&apos;t need your consent. If we
        ever add anything else, we will ask you first.
      </p>

      <h2>Removing them</h2>
      <p>
        Signing out deletes the session cookie. You can clear the rest in your browser settings; the site still works, it just forgets your betslip and
        preferences. Questions: <a href={`mailto:${l.email}`}>{l.email}</a>.
      </p>
    </LegalPage>
  );
}
