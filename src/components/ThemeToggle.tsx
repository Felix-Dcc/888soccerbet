"use client";
import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";

type Theme = "dark" | "light";
const THEME_EVENT = "kb:theme";

/** Dark / White switch. Applies to <html> at once and is remembered per browser. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  // THEME_SCRIPT already applied the saved theme before paint; this only syncs the control, and
  // keeps every copy of it (menu + Account page) in step.
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  const pick = (t: Theme) => {
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {}
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <div role="radiogroup" aria-label="Appearance" className={`inline-flex rounded-lg border border-line bg-ink-600 p-0.5 ${className}`}>
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => pick(t)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            theme === t ? "bg-ink-700 text-white shadow-card" : "text-fog hover:text-white"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {t === "dark" ? (
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            )}
          </svg>
          {t === "dark" ? "Dark" : "White"}
        </button>
      ))}
    </div>
  );
}
