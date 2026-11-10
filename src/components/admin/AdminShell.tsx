"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  CalendarPlus,
  Megaphone,
  Users,
  UserCog,
  ShieldCheck,
  ScrollText,
  Settings,
  Menu,
  X,
  LogOut,
  ArrowLeft,
  Sun,
  Moon,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";

/** Lucide icon per nav item (keys set in the admin layout). */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  operations: Ticket,
  games: CalendarPlus,
  referrals: Megaphone,
  players: Users,
  team: UserCog,
  roles: ShieldCheck,
  audit: ScrollText,
  system: Settings,
};

export interface NavSection {
  label: string;
  items: { href: string; label: string; icon: string }[];
}

const THEME_KEY = "kb.admin.theme";

/**
 * Admin console frame, matching the Bet Prime layout: a white sidebar with green active items,
 * the logo and an ADMIN badge at top, a flat nav list, and Back to Site + Log Out at the bottom.
 * Desktop has no top bar; mobile gets a thin header with a hamburger.
 */
export function AdminShell({
  sections,
  user,
  roleLabel,
  roleBadge,
  children,
}: {
  sections: NavSection[];
  user: string;
  roleLabel: string;
  roleBadge: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const logout = useLogout();
  const [drawer, setDrawer] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    try {
      if (localStorage.getItem(THEME_KEY) === "dark") setTheme("dark");
    } catch {}
  }, []);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
      document.documentElement.dataset.adminTheme = next;
      return next;
    });

  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const items = sections.flatMap((s) => s.items);

  /* Shared sidebar content so the desktop rail and the mobile drawer render the same nav. */
  const navContent = (
    <>
      <nav aria-label="Admin" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {items.map((item) => {
          const Ico = ICONS[item.icon] ?? LayoutDashboard;
          const on = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`group flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors duration-150 ${
                on ? "bg-lime text-lime-ink shadow-sm shadow-lime/20" : "text-fog hover:bg-ink-600 hover:text-white"
              }`}
            >
              <Ico size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {on && <ChevronRight size={16} strokeWidth={2} className="shrink-0 opacity-60" aria-hidden />}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-line px-3 py-3">
        <button
          onClick={toggleTheme}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-fog transition-colors hover:bg-ink-600 hover:text-white"
        >
          {theme === "dark" ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <Link
          href="/"
          className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fog transition-colors hover:bg-ink-600 hover:text-white"
        >
          <ArrowLeft size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
          Back to Site
        </Link>
        <button
          onClick={logout}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <LogOut size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
          Log Out
        </button>
      </div>
    </>
  );

  return (
    <div data-admin-theme={theme} className="admin-shell flex min-h-screen bg-ink-900">
      {/* ---- Desktop sidebar ---- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-ink-800 lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 px-5">
          <Link href="/admin" aria-label="Console home" className="min-w-0">
            <Logo size="sm" />
          </Link>
          <span className="shrink-0 rounded-md bg-lime/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime ring-1 ring-inset ring-lime/20">
            {roleBadge.split(" ")[0]}
          </span>
        </div>
        {navContent}
      </aside>

      {/* ---- Content column ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header — desktop has no top bar (Bet Prime style). */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ink-800 px-4 lg:hidden">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-lg text-fog hover:bg-ink-600">
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <Logo size="sm" />
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">
          {children}
        </main>
      </div>

      {/* ---- Mobile drawer ---- */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label="Admin menu" className="absolute inset-y-0 left-0 flex w-[260px] max-w-[85vw] flex-col bg-ink-800 shadow-lift">
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <Link href="/admin">
                <Logo size="sm" />
              </Link>
              <button onClick={() => setDrawer(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-lg text-fog hover:bg-ink-600">
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
            {navContent}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ends the session the same way the player account panel does. */
function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("sb:refresh"));
    router.push("/");
    router.refresh();
  };
}
