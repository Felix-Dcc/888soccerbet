"use client";
import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Logo } from "./Logo";
import { SportIcon } from "./SportIcon";
import { formatPesewas } from "@/lib/money";

const NAV = [
  { href: "/", label: "Sports" },
  { href: "/live", label: "Live" },
  { href: "/results", label: "Results" },
  { href: "/bets", label: "My Bets" },
  { href: "/promotions", label: "Promotions" },
];

interface Me {
  user: { displayName?: string | null; email: string; role: string; emailVerified?: boolean } | null;
  balance?: string;
}

export function Header() {
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const path = usePathname();

  const load = useCallback(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("stakra:refresh", h);
    return () => window.removeEventListener("stakra:refresh", h);
  }, [load]);

  useEffect(() => {
    setMenu(false);
    setSearching(false);
  }, [path]);

  const loggedIn = !!me?.user;
  const isAdmin = me?.user?.role === "ADMIN" || me?.user?.role === "SUPER_ADMIN";
  const balance = me?.balance ? formatPesewas(BigInt(me.balance)) : "";
  const nav = isAdmin ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  // In the console the player chrome (search, balance, deposit) is noise: show a quiet bar instead.
  const onConsole = path.startsWith("/admin");

  return (
    <>
      {/* Only this top bar stays pinned; the tab row and sports row scroll away beneath it. */}
      <header className="theme-dark sticky top-0 z-40 border-b border-line bg-ink-800">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-3 max-[390px]:gap-1.5 sm:gap-3 sm:px-4 lg:h-[60px] lg:gap-6">
          <Link href="/" aria-label="Kingz Bet home" className="shrink-0">
            {/* Slightly smaller wordmark on narrow phones, so search, the balance eye, balance and menu fit beside it. */}
            <Logo className="max-[400px]:[&>span:last-child]:text-base max-[390px]:[&>span:last-child]:text-[15px]" />
          </Link>

          {!onConsole && (
            <div className="hidden flex-1 justify-center lg:flex">
              <SearchForm />
            </div>
          )}

          <div className="ml-auto flex items-center gap-1 max-[390px]:gap-0.5 sm:gap-2">
            {!onConsole && (
              <button
                className="grid h-9 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white max-[390px]:w-7 sm:w-9 lg:hidden"
                aria-label="Search matches"
                aria-expanded={searching}
                onClick={() => setSearching((s) => !s)}
              >
                <SportIcon sport="search" />
              </button>
            )}
            {onConsole ? (
              <>
                <Link href="/" className="btn border border-white/25 px-3 py-1.5 text-[13px] text-white hover:border-white/50 hover:bg-white/5 sm:px-4 sm:py-2 sm:text-sm">
                  View site
                </Link>
                <Link href="/account" className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white">
                  <SportIcon sport="account" className="h-5 w-5" />
                  <span className="hidden sm:inline">Account</span>
                </Link>
              </>
            ) : me === null ? (
              <div className="h-9 w-32 animate-pulse rounded-lg bg-white/10" />
            ) : loggedIn ? (
              <>
                <Balance amount={balance} onRefresh={load} />
                <Link href="/wallet" className="btn-lime hidden px-3 py-1.5 text-[13px] sm:inline-flex sm:px-4 sm:py-2 sm:text-sm">
                  Deposit
                </Link>
                <Link
                  href="/account"
                  className="hidden h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white md:inline-flex"
                >
                  <SportIcon sport="account" className="h-5 w-5" />
                  Account
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="btn border border-white/25 px-3 py-1.5 text-[13px] text-white hover:border-white/50 hover:bg-white/5 sm:px-4 sm:py-2 sm:text-sm"
                >
                  Log in
                </Link>
                <Link href="/register" className="btn-lime px-3 py-1.5 text-[13px] sm:px-4 sm:py-2 sm:text-sm">
                  {/* one span: the button's flex gap must not split "Join" and "now" */}
                  <span>
                    Join<span className="hidden sm:inline"> now</span>
                  </span>
                </Link>
              </>
            )}
            {!onConsole && (
            <button
              className="grid h-9 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white max-[390px]:w-7 sm:w-9 md:hidden"
              aria-label="More"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            )}
          </div>
        </div>

        {searching && (
          <div className="border-t border-white/10 px-4 py-3 lg:hidden">
            <SearchForm autoFocus />
          </div>
        )}
        {menu && (
          <nav aria-label="More" className="animate-fade-in border-t border-white/10 px-4 py-2 md:hidden">
            {[...nav.filter((n) => n.href !== "/"), { href: "/wallet", label: "Wallet" }].map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 font-semibold text-white/85 hover:bg-white/10 hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {me?.user?.emailVerified === false && path !== "/verify-email" && (
        <div role="status" className="theme-dark border-b border-lime/25 bg-lime/10 text-white">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm sm:px-4">
            <span>Confirm your email to deposit and withdraw.</span>
            <Link href="/verify-email" className="font-bold text-lime underline underline-offset-2">
              Enter code
            </Link>
          </div>
        </div>
      )}
      {!path.startsWith("/admin") && (
      <div className="theme-dark hidden border-b border-line bg-ink-800 md:block">
        <nav aria-label="Main" className="mx-auto hidden h-11 max-w-[1280px] items-end gap-1 px-4 md:flex">
          {nav.map((n) => {
            const active = n.href === "/" ? path === "/" || path.startsWith("/fixture") : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-1.5 rounded-t-lg px-4 text-sm font-bold transition ${
                  active ? "bg-ink-900 text-lime" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                {n.label === "Live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />}
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>

      )}
      {/* The admin console has its own navigation; the player rows would only get in the way. */}
      {!path.startsWith("/admin") && (
        <Suspense>
          <SportsBar />
        </Suspense>
      )}
    </>
  );
}

/** White sports row under the band: quick filters that every betting session starts from. */
function SportsBar() {
  const path = usePathname();
  const params = useSearchParams();
  const onHome = path === "/";
  const sport = params.get("sport");
  const hours = params.get("hours");
  const items = [
    { href: "/", label: "Home", active: onHome && !sport && !hours && !params.get("comp") && !params.get("q") },
    { href: "/?sport=football", label: "Football", icon: "football", active: onHome && sport === "football" },
    { href: "/?sport=basketball", label: "Basketball", icon: "basketball", active: onHome && sport === "basketball" },
    { href: "/live", label: "Live now", icon: "live", active: path === "/live" },
    { href: "/?hours=3", label: "Next 3 hours", icon: "clock", active: onHome && hours === "3" && !sport },
    { href: "/?hours=24", label: "Today & tomorrow", icon: "clock", active: onHome && hours === "24" && !sport },
    { href: "/results", label: "Results", icon: "results", active: path === "/results" },
  ];
  return (
    <nav aria-label="Sports" className="border-b border-line bg-ink-700">
      <div className="mx-auto flex h-11 max-w-[1280px] items-stretch gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={i.active ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-sm font-semibold transition ${i.active ? "text-lime" : "text-fog hover:text-white"}`}
          >
            {i.icon && <SportIcon sport={i.icon} className={`h-4 w-4 ${i.icon === "live" ? "text-danger" : ""}`} />}
            {i.label}
            {i.active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-lime" />}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * Balance with hide (remembered per browser) and refresh, as on most sportsbooks. Phones get a
 * compact pill instead (balance + a "+" to deposit), since the full bar and a Deposit button
 * don't fit beside the logo.
 */
function Balance({ amount, onRefresh }: { amount: string; onRefresh: () => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("kb.hideBalance") === "1");
    } catch {}
  }, []);
  const toggle = () => {
    setHidden((h) => {
      try {
        localStorage.setItem("kb.hideBalance", h ? "0" : "1");
      } catch {}
      return !h;
    });
  };
  const btn = "grid h-7 w-7 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white";
  const text = `GHS ${amount}`;
  return (
    <>
      {/* Phones: the eye sits right after search; the full bar below carries its own. */}
      <button
        onClick={toggle}
        className="grid h-9 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white max-[390px]:w-7 sm:hidden"
        aria-label={hidden ? "Show balance" : "Hide balance"}
        aria-pressed={hidden}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {hidden && <path d="M4 4l16 16" />}
        </svg>
      </button>
      <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-black/15 py-0.5 pl-2 pr-0.5 sm:hidden">
        <Link
          href="/wallet"
          className={`whitespace-nowrap font-bold tabular-nums text-lime ${amount.length > 9 ? "text-[12px]" : "text-[13px]"}`}
          aria-label={hidden ? "Balance hidden, open wallet" : `Balance ${text}, open wallet`}
        >
          {/* On the narrowest phones a 5+ figure balance needs the label's room; the aria-label keeps "GHS". */}
          <span className={`mr-0.5 text-[10px] font-semibold text-white/70 ${amount.length > 8 ? "max-[390px]:hidden" : ""}`}>GHS</span>
          {hidden ? "••••" : amount}
        </Link>
        <Link href="/wallet" aria-label="Deposit" className="grid h-7 w-7 place-items-center rounded-md bg-lime text-lime-ink hover:bg-lime-600">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </div>
      <div className="hidden items-center gap-0.5 rounded-lg border border-white/20 bg-black/15 py-0.5 pl-3 pr-1 sm:flex">
        <Link href="/wallet" className="mr-1 text-sm font-bold tabular-nums text-lime" aria-label={hidden ? "Balance hidden" : `Balance ${text}`}>
          {hidden ? "GHS ••••" : text}
        </Link>
        <button onClick={toggle} className={btn} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {hidden && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <button onClick={onRefresh} className={btn} aria-label="Refresh balance">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
          </svg>
        </button>
      </div>
    </>
  );
}

/** Searches teams and competitions via the home page (`/?q=`), which filters server-side. */
function SearchForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        router.push(t ? `/?q=${encodeURIComponent(t)}` : "/");
      }}
      className="relative w-full max-w-md"
    >
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-white/60">
        <SportIcon sport="search" className="h-4 w-4" />
      </span>
      <label htmlFor={autoFocus ? "q-mobile" : "q"} className="sr-only">
        Search teams or competitions
      </label>
      <input
        ref={input}
        id={autoFocus ? "q-mobile" : "q"}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search teams or competitions"
        maxLength={60}
        className="h-10 w-full rounded-full border border-white/15 bg-white/10 py-0 pl-9 pr-4 text-sm text-white outline-none transition placeholder:text-white/55 focus:border-lime focus:bg-white/15 focus:ring-2 focus:ring-lime/30"
      />
    </form>
  );
}
