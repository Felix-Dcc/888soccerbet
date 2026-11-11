"use client";
import { useEffect, useState } from "react";
import { Betslip } from "./betslip/Betslip";
import { OPEN_SLIP_EVENT, useBetslip } from "./betslip/BetslipContext";
import { MyBets } from "./MyBets";

/**
 * The rail's two faces: the slip you're building, and the bets you've already placed.
 * The tab bar is the card's header, so the slip itself renders bare inside it.
 */
export function BetslipRail() {
  const [tab, setTab] = useState<"slip" | "bets">("slip");
  const { picks } = useBetslip();

  // "Load a booking code" focuses a field inside the slip, so make sure that side is showing.
  useEffect(() => {
    const onOpen = () => setTab("slip");
    window.addEventListener(OPEN_SLIP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SLIP_EVENT, onOpen);
  }, []);

  const tabs = [
    { key: "slip" as const, label: "Betslip", count: picks.length },
    { key: "bets" as const, label: "My Bets", count: 0 },
  ];

  return (
    <div className="card overflow-hidden">
      <div role="tablist" aria-label="Betslip and my bets" className="grid grid-cols-2 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex items-center justify-center gap-1.5 py-3 font-display text-sm font-bold transition-colors ${
              tab === t.key ? "text-lime" : "text-fog hover:text-white"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span key={t.count} className="grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-lime px-1.5 text-xs font-bold text-lime-ink">
                {t.count}
              </span>
            )}
            {tab === t.key && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-lime" />}
          </button>
        ))}
      </div>

      {tab === "slip" ? <Betslip bare /> : <MyBets />}
    </div>
  );
}
