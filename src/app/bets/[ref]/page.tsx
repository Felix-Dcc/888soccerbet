import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ensureVerifyCode, ticketByRef } from "@/lib/tickets";
import { SignedOut } from "@/components/SignedOut";
import { TicketView } from "@/components/TicketView";
import { partialLimit, quoteForBet } from "@/lib/cashout";
import { playerCurrency } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/** The owner's ticket: running bets show cash out; settled ones the result ticket with its verify code, Share and Verify. */
export default async function TicketPage({ params }: { params: Promise<{ ref: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <SignedOut title="My bets" />;
  const { ref } = await params;

  const bet = await ticketByRef(decodeURIComponent(ref));
  if (!bet || bet.userId !== user.id) notFound(); // never reveal someone else's ticket

  const currency = await playerCurrency(user);
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link href="/bets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fog hover:text-lime">
        ← My bets
      </Link>
      <h1 className="sr-only">Ticket details</h1>
      {bet.status === "PENDING" ? (
        <TicketView bet={bet} owner cashout={await cashoutProps(bet)} currency={currency} />
      ) : (
        <TicketView bet={bet} verifyCode={await ensureVerifyCode(bet)} owner currency={currency} />
      )}
    </div>
  );
}

async function cashoutProps(bet: NonNullable<Awaited<ReturnType<typeof ticketByRef>>>) {
  const q = await quoteForBet(bet.id);
  return {
    quote: q.available ? { available: true, offer: q.offer.toString() } : { available: false, reason: q.reason },
    auto: bet.autoCashoutTarget !== null ? { target: bet.autoCashoutTarget.toString(), above: !!bet.autoCashoutAbove } : null,
    partialsLeft: Math.max(0, partialLimit(bet.type) - bet.cashouts.filter((c) => !c.full).length),
  };
}
