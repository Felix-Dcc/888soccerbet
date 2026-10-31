"use client";
import { useState } from "react";

/** Copy that also works on plain http (a phone on the local network), where navigator.clipboard is missing. */
async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea copy */
  }
  const ta = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
  ta.style.cssText = "position:fixed;top:0;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

/** Shares the ticket's public verification link: the system share sheet, else copies the link. */
export function ShareTicket({ code, won, amount, className = "btn-lime h-12 w-full text-[15px]" }: { code: string; won: boolean; amount: string; className?: string }) {
  const [note, setNote] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}/verify/${code}`;
    const text = won ? `I won GHS ${amount} on 888SoccerBet! Verify my ticket:` : "My 888SoccerBet ticket:";
    if (navigator.share) {
      try {
        await navigator.share({ title: "888SoccerBet ticket", text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // share sheet closed
      }
    }
    // No share sheet (or it failed): copy the link; if even that is blocked, show it to copy by hand.
    setNote((await copy(`${text} ${url}`)) ? "Link copied" : url);
    setTimeout(() => setNote(null), 5000);
  }

  return (
    <div className="relative">
      <button type="button" onClick={share} className={className}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {won ? "Share win" : "Share"}
      </button>
      {note && (
        <span role="status" className="absolute inset-x-0 top-full z-10 mt-2 select-all break-all rounded-md bg-black/85 px-2 py-1.5 text-center text-xs text-white">
          {note}
        </span>
      )}
    </div>
  );
}
