import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { legal } from "@/lib/legal";
import { supportEmail } from "@/lib/support";

export const dynamic = "force-dynamic"; // states the live operator settings
export const metadata: Metadata = { title: "Refund Policy — Bet Zone" };

/** When money comes back to the player, and when it can't. Mirrors what the wallet and settlement code do. */
export default async function RefundsPage() {
  const l = legal();
  const email = await supportEmail();
  return (
    <LegalPage title="Refund Policy" path="/refunds">
      <h2>Bets</h2>
      <ul>
        <li>A confirmed bet can&apos;t be cancelled or refunded, because the stake is committed when it is accepted.</li>
        <li>If a match is cancelled, abandoned or not completed, its selections are void and your stake comes back (a single), or the selection counts at odds 1.00 (a multiple).</li>
        <li>A whole-number line that lands exactly on the result is a push: the stake on it is returned.</li>
        <li>A completed cash out is final and can&apos;t be reversed.</li>
      </ul>

      <h2>Deposits</h2>
      <ul>
        <li>Your balance is credited only when the mobile money payment succeeds. A failed or declined payment isn&apos;t charged and nothing is added.</li>
        <li>
          Money you deposited and haven&apos;t staked can be withdrawn at any time, subject to the withdrawal rules in our <Link href="/terms">Terms</Link>.
        </li>
        <li>If you were charged but your balance wasn&apos;t credited, email us with the payment reference and we will credit or return it.</li>
      </ul>

      <h2>Withdrawals</h2>
      <ul>
        <li>The amount leaves your balance when you request a withdrawal. If the mobile money payment fails, it is returned to your balance automatically.</li>
      </ul>

      <h2>Withdrawal verification payments</h2>
      <ul>
        <li>Verification payments are held, never kept. After our review they are returned to your balance, whether verification is approved or not.</li>
      </ul>

      <h2>Closing your account</h2>
      <p>
        If you close your account, you can withdraw your remaining balance first. Contact <a href={`mailto:${email}`}>{email}</a> for anything not covered
        here.
      </p>
    </LegalPage>
  );
}
