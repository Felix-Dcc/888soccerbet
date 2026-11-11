"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "./AuthShell";
import { WalletPanel } from "./WalletPanel";
import { LogoutButton } from "./AccountPanel";
import { useCurrency } from "./CurrencyContext";
import { moneyIn } from "@/lib/currency";
import { toPesewas } from "@/lib/money";

/** What the first-deposit page needs: the minimum deposit (GHS) and whether the player pays from Nigeria. */
export interface DepositGateInfo {
  minDepositGhs: number;
  nigerian: boolean;
}

/** Pages a new player can still read before depositing: the rules they agreed to. */
export const GATE_OPEN_PATHS = ["/terms", "/privacy", "/refunds"];

// Shown on the page; the verification box never appears here.
const NO_VERIFICATION = {
  required: false,
  stage: "kyc" as const,
  kyc: { paid: 0, needed: 0, perPaymentGhs: 0, heldGhs: 0 },
  ntt: { paid: 0, needed: 0, perPaymentGhs: 0, heldGhs: 0 },
  status: "UNVERIFIED",
};

/**
 * A new player's first screen: the site opens once a first deposit (the minimum, GHS 50 by default)
 * succeeds. The server clears the flag when the deposit is credited; this page checks every few
 * seconds and when the player comes back to the tab, then reloads into the site.
 */
export function DepositGate({ info }: { info: DepositGateInfo }) {
  const router = useRouter();
  const currency = useCurrency();
  const min = moneyIn(currency, toPesewas(info.minDepositGhs));

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const d = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
        if (alive && (!d?.user || d.mustDeposit === false)) router.refresh(); // deposited (or signed out): show the site
      } catch {
        /* offline for a moment: the next check retries */
      }
    };
    const id = setInterval(check, 5000);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("sb:refresh", check);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("sb:refresh", check);
    };
  }, [router]);

  return (
    <main id="main" className="mx-auto max-w-[1280px] px-4 pb-10 pt-5">
      <AuthShell
        title="Make your first deposit"
        subtitle={`Deposit at least ${min} to open Bet Zone and start betting. It goes straight into your balance.`}
        footer={
          // AuthShell puts the footer in a <p>: phrasing elements only.
          <span className="flex flex-col items-center gap-3">
            <LogoutButton />
            <span className="text-xs text-fog-muted">
              <Link href="/terms" className="hover:text-lime">Terms</Link> · <Link href="/privacy" className="hover:text-lime">Privacy</Link> ·{" "}
              <Link href="/refunds" className="hover:text-lime">Refunds</Link>
            </span>
          </span>
        }
      >
        <WalletPanel minDepositGhs={info.minDepositGhs} minWithdrawalGhs={0} verification={NO_VERIFICATION} nigerian={info.nigerian} depositOnly />
      </AuthShell>
    </main>
  );
}
