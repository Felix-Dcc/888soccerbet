import Link from "next/link";
import { Logo } from "./Logo";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  { title: "Sports", links: [{ href: "/?sport=football", label: "Football" }, { href: "/?sport=basketball", label: "Basketball" }, { href: "/live", label: "Live" }] },
  { title: "Account", links: [{ href: "/bets", label: "My bets" }, { href: "/wallet", label: "Wallet" }, { href: "/account", label: "Account" }] },
  { title: "Help", links: [{ href: "mailto:support@kingzbet.gh", label: "Support" }, { href: "/account", label: "Betting limits" }, { href: "/promotions", label: "Promotions" }] },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/cookies", label: "Cookies Policy" },
      { href: "/refunds", label: "Refund Policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="theme-dark mt-6 bg-[#0A0F17] pb-28 lg:pb-10">
      <div className="h-1 bg-[linear-gradient(90deg,#0B4A2A,#0F8A3C,#F5C451,#0F8A3C,#0B4A2A)]" />
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-8 px-4 pt-10 sm:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="col-span-2 sm:col-span-1">
          <Logo />
          <p className="mt-4 flex items-center gap-2.5 text-sm text-fog">
            <span className="inline-grid h-8 w-8 place-items-center rounded-full border-2 border-danger text-[11px] font-extrabold text-white">18+</span>
            Betting is for adults only. Play responsibly.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-fog-muted">{c.title}</h2>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm font-semibold text-fog transition hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-[1280px] flex-col gap-2 border-t border-white/[0.08] px-4 pt-5 text-[11px] text-fog-muted sm:flex-row sm:justify-between">
        {/* Compliance notice, not a tagline: keep while unlicensed. */}
        <p>Sandbox · not licensed · no real-money wagers</p>
        <p>
          Photos:{" "}
          <a href="https://unsplash.com/license" target="_blank" rel="noreferrer" className="underline hover:text-white">
            Unsplash
          </a>{" "}
          and other sources{" "}
          · Team badges &amp; league artwork:{" "}
          <a href="https://www.thesportsdb.com" target="_blank" rel="noreferrer" className="underline hover:text-white">
            TheSportsDB
          </a>
        </p>
      </div>
    </footer>
  );
}
