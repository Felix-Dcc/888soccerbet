"use client";
import { useEffect, useRef, useState } from "react";
import { formatMilliOdds } from "@/lib/money";
import { useBetslip, type Pick } from "./BetslipContext";

const MOVE_MS = 4000;

/**
 * label is omitted in table rows, where the column header names the outcome.
 * className always applies (size); idleClassName only when unselected, so a custom
 * background can never override the selected state.
 * When a refresh brings a new price, the button flashes with ▲ (longer) or ▼ (shorter) for a
 * few seconds, so a moving market is visible at a glance.
 */
export function OddsButton({ pick, label, className = "", idleClassName = "" }: { pick: Pick; label?: string; className?: string; idleClassName?: string }) {
  const { add, has } = useBetslip();
  const active = has(pick.selectionId);
  const prev = useRef(pick.milliOdds);
  const [move, setMove] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (pick.milliOdds === prev.current) return;
    setMove(pick.milliOdds > prev.current ? "up" : "down");
    prev.current = pick.milliOdds;
    const t = setTimeout(() => setMove(null), MOVE_MS);
    return () => clearTimeout(t);
  }, [pick.milliOdds]);

  return (
    <button
      type="button"
      onClick={() => add(pick)}
      aria-pressed={active}
      aria-label={`${pick.fixtureName}, ${pick.marketName}, ${pick.selectionName}, odds ${formatMilliOdds(pick.milliOdds)}${move ? (move === "up" ? ", odds went up" : ", odds went down") : ""}`}
      className={`odd relative w-full ${active ? "odd-active" : idleClassName} ${move ? `kb-odd-${move}` : ""} ${className}`}
    >
      {label && <span className="max-w-full truncate px-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</span>}
      <span className="odd-price text-sm font-bold tabular-nums">{formatMilliOdds(pick.milliOdds)}</span>
      {move && (
        <span aria-hidden className={`absolute right-1 top-0.5 text-[9px] leading-none ${move === "up" ? "text-[#E9FFB8]" : "text-[#FFC2C2]"}`}>
          {move === "up" ? "▲" : "▼"}
        </span>
      )}
    </button>
  );
}
