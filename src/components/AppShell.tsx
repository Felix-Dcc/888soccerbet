"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BetslipProvider, OPEN_SLIP_EVENT, useBetslip } from "./betslip/BetslipContext";
import type { BonusRules } from "@/lib/bonus";
import { BetslipRail } from "./BetslipRail";
import { Header } from "./Header";
import { WinningPopup } from "./WinningPopup";
import { SportIcon } from "./SportIcon";
import { DATA_CHANGED_EVENT, LiveRefresh } from "./LiveRefresh";
import { FlashNotice } from "./FlashNotice";

/**
 * The signed-in player's open (unsettled) bets, for the My Bets badge; 0 when signed out. Re-read on
 * every page change, when a bet is placed or cashed out (sb:refresh), when match data changes
 * (settlement) and when the player comes back to the tab.
 */
function useOpenBets(path: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setCount(Number(d?.openBets) || 0))
        .catch(() => {}); // offline for a moment: keep the last count
    };
    const onVisible = () => document.visibilityState === "visible" && load();
    load();
    window.addEventListener("sb:refresh", load);
    window.addEventListener(DATA_CHANGED_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("sb:refresh", load);
      window.removeEventListener(DATA_CHANGED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path]);
  return count;
}

/** Mobile tab bar with the betslip in the centre, as on native sportsbook apps. */
function BottomNav({ onSlip }: { onSlip: () => void }) {
  const { picks } = useBetslip();
  const path = usePathname();
  const openBets = useOpenBets(path);
  const tab = (href: string, label: string, icon: string, active: boolean, badge = 0) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge ? `${label}, ${badge} open` : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active ? "text-lime" : "text-fog"}`}
    >
      <SportIcon sport={icon} />
      {label}
      {badge > 0 && (
        <span key={badge} aria-hidden className="absolute left-1/2 top-0.5 ml-1.5 grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ink-900">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-end">
        {tab("/", "Home", "all", path === "/")}
        {tab("/live", "Live", "live", path === "/live")}
        <button onClick={onSlip} aria-label={`Open betslip, ${picks.length} selections`} className="relative -mt-5 flex flex-1 flex-col items-center gap-0.5 pb-2 text-[10px] font-semibold text-fog">
          <span className={`grid h-12 w-12 place-items-center rounded-full ring-4 ring-ink-900 ${picks.length ? "bg-lime text-lime-ink" : "bg-ink-600 text-white"}`}>
            <SportIcon sport="bets" className="h-6 w-6" />
          </span>
          Betslip
          {picks.length > 0 && (
            <span key={picks.length} className="absolute right-[calc(50%-26px)] top-0 grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-ink">
              {picks.length}
            </span>
          )}
        </button>
        {tab("/bets", "My Bets", "bets", path.startsWith("/bets"), openBets)}
        {tab("/account", "Account", "account", path.startsWith("/account"))}
      </div>
    </nav>
  );
}

function MobileSlip({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  useEffect(onClose, [path]); // navigating away closes the drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Betslip">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] animate-slide-up overflow-auto rounded-t-3xl border-t border-line bg-ink-800 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-fog/30" />
        <button onClick={onClose} className="absolute right-4 top-3 text-sm font-semibold text-fog hover:text-white">
          Close
        </button>
        <div className="pt-4">
          <BetslipRail />
        </div>
      </div>
    </div>
  );
}

export { OPEN_SLIP_EVENT };

export function AppShell({
  sidebar,
  rail,
  footer,
  minStakeGhs,
  bonus,
  siteUrl,
  children,
}: {
  sidebar: React.ReactNode;
  rail?: React.ReactNode; // sits under the betslip on desktop (e.g. the most-backed list)
  footer?: React.ReactNode;
  minStakeGhs: number;
  bonus: BonusRules;
  siteUrl: string; // the public address shared links use (betzone.com.co in production)
  children: React.ReactNode;
}) {
  const [slipOpen, setSlipOpen] = useState(false);
  const close = () => setSlipOpen(false);
  // Focused pages (admin console, sign-in, sign-up) get the full width: no sports menu or betslip rails.
  const path = usePathname();
  const staffArea = path.startsWith("/admin");
  const adminView = staffArea || path === "/login" || path === "/register";

  // "Load a booking code" from anywhere: desktop focuses the rail's field; mobile opens the drawer first.
  useEffect(() => {
    const focusCode = (root: ParentNode | null) => root?.querySelector<HTMLInputElement>("[data-booking-code]")?.focus();
    const onOpen = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        const rail = document.querySelector('aside[aria-label="Betslip"]');
        rail?.scrollIntoView({ block: "nearest" });
        focusCode(rail);
      } else {
        setSlipOpen(true);
        setTimeout(() => focusCode(document.querySelector('[role="dialog"][aria-label="Betslip"]')), 50);
      }
    };
    window.addEventListener(OPEN_SLIP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SLIP_EVENT, onOpen);
  }, []);
  return (
    <BetslipProvider minStake={minStakeGhs} bonus={bonus} siteUrl={siteUrl}>
      {/* Keyboard users jump past the header, sports row and menu straight to the page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-lg focus:bg-lime focus:px-4 focus:py-2.5 focus:font-bold focus:text-lime-ink"
      >
        Skip to content
      </a>
      <Suspense>
        <Header />
      </Suspense>
      {staffArea ? (
        // The admin console is its own dark workspace: full width, no player navigation.
        <main id="main" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </main>
      ) : adminView ? (
        <main id="main" tabIndex={-1} className="mx-auto min-w-0 max-w-[1280px] px-4 pb-28 pt-5 outline-none lg:pb-10">
          {children}
        </main>
      ) : (
        <div className="mx-auto grid max-w-[1280px] gap-5 px-4 pb-28 pt-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:pb-10 xl:grid-cols-[208px_minmax(0,1fr)_300px]">
          <aside className="hidden xl:block">
            <div className="sticky top-[76px] max-h-[calc(100vh-92px)] overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{sidebar}</div>
          </aside>
          <main id="main" tabIndex={-1} className="min-w-0 outline-none">
            <FlashNotice />
            {children}
          </main>
          <aside className="hidden lg:block" aria-label="Betslip">
            <div className="sticky top-[76px] max-h-[calc(100vh-92px)] space-y-4 overflow-y-auto overscroll-contain pb-4 [scrollbar-width:thin]">
              <BetslipRail />
              {rail}
            </div>
          </aside>
        </div>
      )}
      {/* The console is its own workspace: the player footer and tab bar don't belong in it. */}
      {!staffArea && footer}
      {!staffArea && <BottomNav onSlip={() => setSlipOpen(true)} />}
      <MobileSlip open={slipOpen} onClose={close} />
      <WinningPopup />
      {!adminView && <LiveRefresh />}
    </BetslipProvider>
  );
}
