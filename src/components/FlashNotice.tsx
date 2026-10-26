"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** One-off message carried to the next page (e.g. "GHS 50.00 added." after a deposit), shown on Home. */
export const FLASH_KEY = "kb.flash";

export function FlashNotice() {
  const path = usePathname();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (path !== "/") return;
    try {
      const t = sessionStorage.getItem(FLASH_KEY);
      if (!t) return;
      sessionStorage.removeItem(FLASH_KEY);
      setText(t);
    } catch {
      return; // storage blocked: nothing to show
    }
    const timer = setTimeout(() => setText(null), 8000);
    return () => clearTimeout(timer);
  }, [path]);

  if (!text) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#639922] bg-[#EAF3DE] px-4 py-3 text-sm text-[#27500A]">
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#3B6D11]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
      <p className="min-w-0 flex-1">
        <span className="font-bold">{text}</span> Good luck!
      </p>
      <button type="button" onClick={() => setText(null)} aria-label="Dismiss" className="grid h-7 w-7 place-items-center rounded-full text-[#3B6D11] hover:bg-[#3B6D11]/10">
        ×
      </button>
    </div>
  );
}
