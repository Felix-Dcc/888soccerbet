"use client";
import { useEffect, useState } from "react";
import { THEME_EVENT, THEME_KEY } from "@/lib/theme";

type Choice = "dark" | "light" | "system";
const CHOICES: { key: Choice; label: string }[] = [
  { key: "dark", label: "Dark" },
  { key: "light", label: "White" },
  { key: "system", label: "System" },
];

const saved = (): Choice => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" || t === "system" ? t : "light";
  } catch {
    return "light";
  }
};

/** Dark / White / System switch. System follows the phone's own setting. Applies at once and is remembered per browser. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [choice, setChoice] = useState<Choice>("light");
  // THEME_SCRIPT already applied the saved theme before paint; this only syncs the control, and
  // keeps every copy of it (menu + Account page) in step.
  useEffect(() => {
    const sync = () => setChoice(saved());
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  const pick = (c: Choice) => {
    try {
      localStorage.setItem(THEME_KEY, c);
    } catch {}
    const apply = (window as { __bzTheme?: () => void }).__bzTheme;
    if (apply) apply();
    else {
      // Storage blocked or script missing: apply this page view only.
      const dark = c === "dark" || (c === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      if (dark) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = "light";
      setChoice(c);
    }
  };

  return (
    <div role="radiogroup" aria-label="Appearance" className={`inline-flex rounded-lg border border-line bg-ink-600 p-0.5 ${className}`}>
      {CHOICES.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={choice === key}
          onClick={() => pick(key)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            choice === key ? "bg-ink-700 text-white shadow-card" : "text-fog hover:text-white"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {key === "dark" ? (
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
            ) : key === "light" ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            ) : (
              <>
                <rect x="7" y="2.5" width="10" height="19" rx="2" />
                <path d="M11 18h2" />
              </>
            )}
          </svg>
          {label}
        </button>
      ))}
    </div>
  );
}
