"use client";
import { OPEN_SLIP_EVENT } from "./AppShell";

export function OpenSlipButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SLIP_EVENT))} className={className}>
      {children}
    </button>
  );
}
