import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { legal } from "@/lib/legal";
import { supportEmail } from "@/lib/support";
import { limits } from "@/lib/betEngine";
import { minDeposit, verifyAfterWin, verifyAmount, nttAmount, VERIFY_PAYMENTS } from "@/lib/wallet";
import { cashoutMarginPct, MIN_CASHOUT, partialLimit } from "@/lib/cashout";
import { formatPesewas } from "@/lib/money";
import { getPlatformSettings } from "@/lib/platformSettings";

export const dynamic = "force-dynamic"; // quotes the limits the site enforces right now
export const metadata: Metadata = { title: "Terms & Conditions — Bet Zone" };

const ghs = (p: bigint) => `GHS ${formatPesewas(p)}`;

/** The rules of the service, with every figure read from the settings the code enforces. */
export default async function TermsPage() {
  const l = legal();
  const [stake, ps, email] = await Promise.all([limits(), getPlatformSettings(), supportEmail()]);
  return (
    <LegalPage title="Terms & Conditions" path="/terms">
      <h2>About these terms</h2>
      <p>
        These terms are an agreement between you and {l.operator} (&quot;Bet Zone&quot;, &quot;we&quot;). By creating an account you accept them and our{" "}
        <Link href="/privacy">Privacy Policy</Link>. They are governed by the laws of Ghana, including the Gaming Act, 2006 (Act 721).
      </p>
      <p>
        <strong>
          {l.licence
            ? `Bet Zone is licensed by the Gaming Commission of Ghana (licence ${l.licence}).`
            : "Bet Zone is not yet licensed by the Gaming Commission of Ghana. Until it is, the site runs as a demo and no real money can be wagered."}
        </strong>
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or older and allowed to gamble where you live.</li>
        <li>One account per person, with your own true details and your own mobile money number.</li>
        <li>Keep your password private. You are responsible for bets placed from your account.</li>
        <li>We may suspend or close an account used for fraud, money laundering, or by more than one person.</li>
      </ul>

      <h2>Placing bets</h2>
      <ul>
        <li>
          Stakes are {ghs(stake.min)} to {ghs(stake.max)} per bet, and the most one bet can pay out is {ghs(stake.maxPayout)}.
        </li>
        <li>A bet is placed at the odds shown when you confirm it. If the odds change first, you are asked to accept the new odds before the bet goes through.</li>
        <li>Most matches close for bets at kick-off. Matches marked live stay open in play at prices that follow the score, and pause briefly after each goal. A confirmed bet cannot be cancelled.</li>
        <li>A multiple wins only if every selection wins; it loses as soon as one selection loses.</li>
        <li>Booking codes copy a betslip at the current odds; selections no longer available are left out.</li>
      </ul>

      <h2>Results and settlement</h2>
      <ul>
        <li>Bets are settled on the final result reported by our sports data provider, or entered by our staff for games we list ourselves.</li>
        <li>If a match is cancelled, abandoned or not completed, selections on it are void: a single returns your stake, and in a multiple that selection counts at odds 1.00.</li>
        <li>On a whole-number over/under or handicap line, a result exactly on the line is a push and the stake on it is returned.</li>
        <li>Winnings are paid to your balance when the bet settles.</li>
      </ul>

      <h2>Cash out</h2>
      <ul>
        <li>
          Cash out lets you settle a running bet early for the amount offered. The offer follows the current odds, less a {cashoutMarginPct()}% margin, and is
          paid instead of whatever the bet would have returned.
        </li>
        <li>
          Cash out is offered only while every remaining selection has a live price; it pauses while a match on the bet is in play, and the minimum is{" "}
          {ghs(MIN_CASHOUT)}.
        </li>
        <li>
          Partial cash out settles part of the bet and leaves the rest running at the original odds (up to {partialLimit("SINGLE")} times on a single,{" "}
          {partialLimit("ACCUMULATOR")} on a multiple). Auto cash out does it for you when the offer reaches a value you set.
        </li>
        <li>A completed cash out is final, and the bet is settled as won for the amount cashed out.</li>
      </ul>

      <h2>Deposits and withdrawals</h2>
      <ul>
        <li>
          The minimum deposit is {ghs(await minDeposit())}. Deposits are credited only once the mobile money payment succeeds.
        </li>
        <li>
          Withdraw only to a mobile money number in your own name. The minimum withdrawal is GHS {ps.minWithdrawalGhs}. The amount leaves your balance when you
          request it and comes back if the payment fails.
        </li>
        {ps.minDepositToWithdrawGhs > 0 && (
          <li>You must have deposited at least GHS {ps.minDepositToWithdrawGhs} in total before your first withdrawal.</li>
        )}
        {ps.minLifetimeStakeGhs > 0 && (
          <li>You must have placed at least GHS {ps.minLifetimeStakeGhs} in total bets before withdrawing.</li>
        )}
        {ps.withdrawalCapMultiplier > 0 && (
          <li>A single withdrawal cannot exceed {ps.withdrawalCapMultiplier}× your total deposits.</li>
        )}
        <li>
          Once a single bet pays out more than {ghs(verifyAfterWin())}, withdrawals need two-stage verification before you can withdraw:
          Stage 1 (KYC) — {VERIFY_PAYMENTS} payments of {ghs(await verifyAmount())} each;
          Stage 2 (NTT Compliance) — {VERIFY_PAYMENTS} payments of {ghs(await nttAmount())} each.
          All verification money is held, not kept: after each review it is returned to your balance, whether approved or not.
        </li>
        <li>
          See the <Link href="/refunds">Refund Policy</Link> for refunds and reversals.
        </li>
      </ul>

      <h2>Responsible gambling</h2>
      <p>
        Gamble only with money you can afford to lose. You can set a daily deposit limit, a maximum stake, or exclude yourself for a while on your{" "}
        <Link href="/account">Account</Link> page; we apply them straight away. If gambling stops being fun, take a break and talk to someone you trust.
      </p>

      <h2>Our liability</h2>
      <p>
        We pay bets according to these terms. We are not responsible for losses caused by events outside our control, such as network or mobile money outages, but
        nothing here limits rights you have under Ghanaian law.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If we change these terms in a way that matters, we will ask you to accept the new version. Questions or complaints:{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </LegalPage>
  );
}
