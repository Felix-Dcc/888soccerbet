import Link from "next/link";
import { Logo } from "./Logo";
import { GhanaFlag } from "./GhanaFlag";

/** Only pages that exist. Nothing here advertises a product or document the site doesn't have. */
const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "888SoccerBet Ghana",
    links: [
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/cookies", label: "Cookies Policy" },
      { href: "/refunds", label: "Refund Policy" },
      { href: "mailto:support@888soccerbet.com", label: "Support" },
    ],
  },
  {
    title: "How to play",
    links: [
      { href: "/", label: "Sports" },
      { href: "/live", label: "Live betting" },
      { href: "/results", label: "Results" },
      { href: "/promotions", label: "Promotions" },
      { href: "/bets", label: "My bets" },
      { href: "/wallet", label: "Wallet" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="theme-dark mt-6 border-t border-line bg-ink-800 pb-28 lg:pb-10">
      <div className="h-0.5 bg-lime" />

      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 pt-10 sm:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2.5">
            <Logo />
            <GhanaFlag className="h-3.5 w-5" />
            <span className="font-display text-sm font-bold tracking-wide text-white">Ghana</span>
          </span>
          <p className="mt-3 max-w-xs text-sm text-fog">Football and basketball odds, priced in cedis.</p>
        </div>

        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-3 text-sm font-bold text-white">{c.title}</h2>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="flex items-center gap-1.5 text-sm text-fog transition-colors hover:text-white">
                    <span aria-hidden className="text-fog-muted">
                      ›
                    </span>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Age and harm warning, the way a licensed book is required to carry it. */}
      <div className="mx-auto mt-10 flex max-w-[1280px] items-center gap-3 border-t border-line px-4 pt-5">
        <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-danger text-[11px] font-extrabold text-white">18+</span>
        <p className="text-xs text-fog">Age 18 and above only. Play responsibly — betting is addictive and can be psychologically harmful.</p>
      </div>
    </footer>
  );
}
