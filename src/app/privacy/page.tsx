import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalTable } from "@/components/LegalPage";
import { legal } from "@/lib/legal";
import { supportEmail } from "@/lib/support";

export const dynamic = "force-dynamic"; // states the live operator settings
export const metadata: Metadata = { title: "Privacy Policy — Bet Zone" };

/** What we collect, why, who sees it, how long we keep it, and the player's rights (Act 843). */
export default async function PrivacyPage() {
  const l = legal();
  const email = await supportEmail();
  return (
    <LegalPage title="Privacy Policy" path="/privacy">
      <h2>Who we are</h2>
      <p>
        {l.operator} (&quot;Bet Zone&quot;, &quot;we&quot;) runs this website and is responsible for your personal data. {l.address}. Contact:{" "}
        <a href={`mailto:${email}`}>{email}</a>.
        {l.dpcRegistration
          ? ` We are registered with Ghana's Data Protection Commission (${l.dpcRegistration}).`
          : " Registration with Ghana's Data Protection Commission will be completed before launch."}
      </p>

      <h2>What we collect and why</h2>
      <p>We collect only what we need to run your account, take bets lawfully and keep them secure.</p>
      <LegalTable
        head={["Data", "Why we need it"]}
        rows={[
          ["Name", "To address you in your account and our emails."],
          ["Email address", "To identify your account, sign you in and contact you about it."],
          ["Password", "To sign you in. We store only a scrypt hash, never the password itself."],
          ["Referral code (optional)", "To link your account to the Bet Zone agent who invited you."],
          ["Consent record", "That you confirmed you are 18 or older, and the date and version of the Terms and this policy you accepted."],
          ["Bets, cash outs and transactions", "To run your wallet, pay winnings and keep the records gaming and anti-money-laundering law require."],
          ["Mobile money numbers on payments", "To send and receive each payment and resolve disputes about it."],
          ["Betting limits and self-exclusion", "To apply the limits you set for yourself."],
          ["Sign-in session", "A random token, stored hashed, that keeps you signed in."],
        ]}
      />
      <p>
        We do not collect your location, contacts or ID documents, and we do not store your IP address or browser details with your account. We use no
        analytics, advertising or tracking tools.
      </p>

      <h2>Legal basis</h2>
      <p>
        Under Ghana&apos;s Data Protection Act, 2012 (Act 843) we process your data because you consent when you create an account, because we need it to provide
        the service you signed up for, to meet our legal obligations (age checks and record keeping), and for our legitimate interest in keeping accounts secure and
        preventing fraud.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li>Our mobile money payment provider, for the payments you make or request.</li>
        <li>Our hosting provider, which stores the data on our behalf.</li>
        <li>Brevo, which sends our account emails (sign-up codes, password resets, and notices about wins and payments). It receives your email address and the message.</li>
        <li>
          Cloudflare, whose Turnstile check on the log-in and sign-up pages tells people from bots. It sees technical details of your browser and IP address,
          not your account details, and is used only to keep accounts secure.
        </li>
        <li>Authorities, when the law requires it.</li>
      </ul>
      <p>
        We never sell your data. Our odds and sports data suppliers receive none of it. The share buttons (X, Facebook, WhatsApp) only open those services
        if you tap them.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account data while your account is open. Betting and transaction records are kept afterwards for as long as gaming and anti-money-laundering
        law (including the Anti-Money Laundering Act, 2020 (Act 1044)) requires, then deleted. Sign-in sessions expire after 14 days, or 12 hours if you sign in
        without &quot;Remember me&quot;.
      </p>

      <h2>Security</h2>
      <p>
        Passwords and sign-in tokens are stored only as hashes, the sign-in cookie can&apos;t be read by scripts, and the site uses an encrypted (https) connection
        when it is live.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us for a copy of your data, to correct it, or to delete it (except records the law requires us to keep), and you can object to how we use it.
        Email <a href={`mailto:${email}`}>{email}</a>. If you are unhappy with our answer you can complain to the Data Protection Commission of Ghana.
      </p>

      <h2>Age</h2>
      <p>Bet Zone is only for people aged 18 or over. We do not knowingly collect data about anyone younger.</p>

      <h2>Cookies</h2>
      <p>
        See our <Link href="/cookies">Cookies Policy</Link>.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will ask you to accept the new version.</p>
    </LegalPage>
  );
}
