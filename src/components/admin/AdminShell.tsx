"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  Megaphone,
  Users,
  UserCog,
  ShieldCheck,
  ScrollText,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ArrowLeft,
  Sun,
  Moon,
  Bell,
  Search,
  ChevronDown,
  CalendarPlus,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "./kit";
import { BrandMark, Logo } from "@/components/Logo";

/** Lucide icon per nav item (keys set in the admin layout). 20px, 1.75 stroke throughout. */
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

const COLLAPSE_KEY = "kb.admin.collapsed";
const THEME_KEY = "kb.admin.theme";

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
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");

  // Restore the remembered rail width and theme (per browser). The theme itself is already
  // applied pre-paint by ADMIN_THEME_SCRIPT; this just syncs the toggle's own state.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      if (localStorage.getItem(THEME_KEY) === "dark") setTheme("dark");
    } catch {}
  }, []);

  // Navigating away closes the mobile drawer.
  useEffect(() => setDrawer(false), [path]);

  // Close the drawer on Escape.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const toggleCollapse = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
      // Keep the pre-paint attribute in step, so a reload restores the same theme instantly.
      document.documentElement.dataset.adminTheme = next;
      return next;
    });

  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const current = sections.flatMap((s) => s.items).find((i) => active(i.href));

  return (
    <div data-admin-theme={theme} className="admin-shell flex min-h-screen bg-ink-900 text-white">
      {/* ---- Desktop rail ---- */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-ink-800 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[4.5rem]" : "w-[16.5rem]"
        }`}
      >
        <RailHeader collapsed={collapsed} roleBadge={roleBadge} />
        <NavList sections={sections} collapsed={collapsed} active={active} />
        <RailFooter collapsed={collapsed} user={user} roleLabel={roleLabel} />
      </aside>

      {/* ---- Content column ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: menu (mobile) / collapse (desktop), breadcrumb, search, alerts, theme, profile. */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-ink-900/80 px-4 backdrop-blur-xl sm:gap-3 lg:px-8">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-fog hover:bg-ink-500 hover:text-white lg:hidden"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <button
            onClick={toggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-fog hover:bg-ink-500 hover:text-white lg:grid"
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
          </button>
          <span aria-hidden className="hidden h-5 w-px bg-line lg:block" />
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate text-sm">
            <span className="text-fog">Console</span>
            {current && (
              <>
                <span className="px-2 text-fog-muted">/</span>
                <span className="font-semibold text-white">{current.label}</span>
              </>
            )}
          </nav>

          {/* Global search — submits to the Players page, which already filters on `q`
              (email, phone, player ID, referral code). No new endpoint. */}
          <form action="/admin/users" method="get" role="search" className="relative hidden w-60 shrink-0 md:block lg:w-80">
            <label htmlFor="admin-q" className="sr-only">
              Search users by email, phone, ID or referral code
            </label>
            <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
            <input
              id="admin-q"
              name="q"
              type="search"
              placeholder="Search users, IDs, codes…"
              maxLength={80}
              className="h-10 w-full rounded-xl border border-line bg-ink-700 pl-9 pr-3 text-sm text-white shadow-card outline-none transition placeholder:text-fog-muted focus:border-lime/60 focus:ring-4 focus:ring-lime/15"
            />
          </form>

          <Link
            href="/admin/system"
            aria-label="System alerts"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-fog transition-colors duration-150 hover:bg-ink-500 hover:text-white"
          >
            <Bell size={18} strokeWidth={1.75} />
          </Link>

          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-fog transition-colors duration-150 hover:bg-ink-500 hover:text-white"
          >
            {theme === "dark" ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
          </button>

          {/* Profile menu — same <details> pattern the console already uses for Export. */}
          <details className="relative shrink-0">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-ink-700 py-1 pl-1 pr-2 shadow-card transition-colors duration-150 hover:bg-ink-500 [&::-webkit-details-marker]:hidden">
              <Avatar name={user} size="h-8 w-8 text-[11px]" />
              <span className="hidden max-w-[9rem] truncate text-sm font-medium text-white xl:block">{user}</span>
              <ChevronDown size={14} strokeWidth={2} aria-hidden className="text-fog" />
              <span className="sr-only">Account menu</span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-ink-700 p-1.5 shadow-lift">
              <div className="flex items-center gap-3 px-2.5 py-2.5">
                <Avatar name={user} size="h-9 w-9 text-xs" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{user}</div>
                  <div className="truncate text-xs text-fog">{roleLabel}</div>
                </div>
              </div>
              <div className="my-1 h-px bg-line" />
              <Link href="/account" className="block rounded-lg px-2.5 py-2 text-sm text-white hover:bg-ink-500">
                Account
              </Link>
              <Link href="/" className="block rounded-lg px-2.5 py-2 text-sm text-white hover:bg-ink-500">
                Back to site
              </Link>
              <button onClick={logout} className="block w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-danger hover:bg-danger/10">
                Log out
              </button>
            </div>
          </details>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">{children}</main>
      </div>

      {/* ---- Mobile drawer ---- */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label="Admin menu" className="absolute inset-y-0 left-0 flex w-[17.5rem] max-w-[85vw] flex-col border-r border-line bg-ink-800 shadow-lift">
            <div className="flex items-center justify-between pr-2">
              <RailHeader collapsed={false} roleBadge={roleBadge} />
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-lg text-fog hover:bg-ink-500 hover:text-white">
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
            <NavList sections={sections} collapsed={false} active={active} />
            <RailFooter collapsed={false} user={user} roleLabel={roleLabel} />
          </div>
        </div>
      )}
    </div>
  );
}

function RailHeader({ collapsed, roleBadge }: { collapsed: boolean; roleBadge: string }) {
  if (collapsed) {
    return (
      <div className="flex h-16 shrink-0 items-center justify-center">
        <BrandMark size={32} />
      </div>
    );
  }
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
      {/* The logo is white lettering: in the light theme it sits on a dark plate so it stays legible. */}
      <Link href="/admin" aria-label="Console home" className="rounded-lg [[data-admin-theme=light]_&]:bg-[#0D1016] [[data-admin-theme=light]_&]:px-2 [[data-admin-theme=light]_&]:py-1">
        <Logo className="h-9" />
      </Link>
      <span title={roleBadge} className="rounded-md bg-lime/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-lime ring-1 ring-inset ring-lime/20">
        Admin
      </span>
    </div>
  );
}

function NavList({ sections, collapsed, active }: { sections: NavSection[]; collapsed: boolean; active: (href: string) => boolean }) {
  return (
    <nav aria-label="Admin" className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
      {sections.map((section) => (
        <div key={section.label}>
          {collapsed ? (
            <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-line" />
          ) : (
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fog-muted">{section.label}</div>
          )}
          <ul className="space-y-1">
            {section.items.map((item) => {
              const Ico = ICONS[item.icon] ?? LayoutDashboard;
              const on = active(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`group flex h-10 items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-150 ${collapsed ? "justify-center" : "px-3"} ${
                      on ? "bg-lime/10 text-white ring-1 ring-inset ring-lime/20" : "text-fog hover:bg-ink-500 hover:text-white"
                    }`}
                  >
                    <Ico size={18} strokeWidth={1.75} className={`shrink-0 ${on ? "text-lime" : "text-fog group-hover:text-white"}`} aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
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

function RailFooter({ collapsed, user, roleLabel }: { collapsed: boolean; user: string; roleLabel: string }) {
  const logout = useLogout();
  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-line py-3">
        <Link href="/" title="Back to site" className="grid h-10 w-10 place-items-center rounded-xl text-fog hover:bg-ink-500 hover:text-white">
          <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Back to site</span>
        </Link>
        <button onClick={logout} title="Log out" className="grid h-10 w-10 place-items-center rounded-xl text-fog hover:bg-danger/10 hover:text-danger">
          <LogOut size={18} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Log out</span>
        </button>
      </div>
    );
  }
  return (
    <div className="shrink-0 space-y-1 border-t border-line p-3">
      <Link href="/" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fog transition-colors duration-150 hover:bg-ink-500 hover:text-white">
        <ArrowLeft size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
        Back to site
      </Link>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-700 p-2.5 shadow-card">
        <Avatar name={user} size="h-9 w-9 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{user}</div>
          <div className="truncate text-xs text-fog">{roleLabel}</div>
        </div>
        <button onClick={logout} aria-label="Log out" title="Log out" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fog hover:bg-danger/10 hover:text-danger">
          <LogOut size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}
