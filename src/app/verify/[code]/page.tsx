import type { Metadata } from "next";
import { headers } from "next/headers";
import { clientIpFromHeaders, rateLimit } from "@/lib/rateLimit";
import { ticketByVerifyCode } from "@/lib/tickets";
import { TicketView } from "@/components/TicketView";
import { VerifyForm } from "@/components/VerifyForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ticket verification — Kingz Bet", robots: { index: false } };

/**
 * Public verification: anyone with the code sees the ticket (ID, times, stake, odds, return,
 * selections and results) and that it is genuine. Nothing about the account that placed it.
 */
export default async function VerifyTicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = clientIpFromHeaders(await headers()) ?? "anon";
  // Codes are ~68 bits so guessing is hopeless anyway; this just stops scripted lookups.
  if (!rateLimit(`verify:${ip}`, 30, 60_000).ok)
    return <Notice title="Too many checks" text="Please wait a minute and try again." />;

  const bet = await ticketByVerifyCode(decodeURIComponent(code));
  if (!bet?.verifyCode)
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Notice title="No ticket found" text="No Kingz Bet ticket has this verification code. Check the code and try again." />
        <VerifyForm defaultValue={decodeURIComponent(code)} />
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="sr-only">Ticket verification</h1>
      <div role="status" className="flex items-center gap-3 rounded-xl border border-lime/30 bg-lime/10 px-4 py-3">
        <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-lime" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6l-8-3Z" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </svg>
        <div>
          <div className="font-display font-bold text-white">Genuine Kingz Bet ticket</div>
          <div className="text-xs text-fog">Details below come straight from our records.</div>
        </div>
      </div>
      <TicketView bet={bet} verifyCode={bet.verifyCode} owner={false} />
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div role="alert" className="card px-6 py-10 text-center">
      <div className="font-display text-lg font-bold text-white">{title}</div>
      <p className="mt-1 text-sm text-fog">{text}</p>
    </div>
  );
}
