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
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "./kit";
import { BrandMark } from "@/components/Logo";

/** Lucide icon per nav item (keys set in the admin layout). 20px, 1.75 stroke throughout. */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  operations: Ticket,
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Restore the remembered rail width and theme (per browser). The theme itself is already
  // applied pre-paint by ADMIN_THEME_SCRIPT; this just syncs the toggle's own state.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      if (localStorage.getItem(THEME_KEY) === "light") setTheme("light");
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
    <div data-admin-theme={theme} className="admin-shell flex min-h-[calc(100vh-56px)] bg-ink-900 text-white">
      {/* ---- Desktop rail ---- */}
      <aside
        className={`sticky top-[56px] hidden h-[calc(100vh-56px)] shrink-0 flex-col border-r border-line bg-ink-800 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-16" : "w-[15rem]"
        }`}
      >
        <RailHeader collapsed={collapsed} roleBadge={roleBadge} />
        <NavList sections={sections} collapsed={collapsed} active={active} />
        <RailFooter collapsed={collapsed} user={user} roleLabel={roleLabel} />
      </aside>

      {/* ---- Content column ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: menu (mobile) / collapse (desktop), breadcrumb, theme toggle. */}
        <header className="sticky top-[56px] z-30 flex h-14 items-center gap-3 border-b border-line bg-ink-800/95 px-4 backdrop-blur lg:px-6">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-fog hover:bg-ink-500 hover:text-white lg:hidden"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <button
            onClick={toggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-fog hover:bg-ink-500 hover:text-white lg:grid"
          >
            {collapsed ? <PanelLeftOpen size={20} strokeWidth={1.75} /> : <PanelLeftClose size={20} strokeWidth={1.75} />}
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate text-sm">
            <span className="text-fog">Console</span>
            {current && (
              <>
                <span className="px-1.5 text-fog/60">/</span>
                <span className="font-semibold text-white">{current.label}</span>
              </>
            )}
          </nav>

          {/* Global search — submits to the Players page, which already filters on `q`
              (email, phone, player ID, referral code). No new endpoint. */}
          <form action="/admin/users" method="get" role="search" className="relative hidden w-56 shrink-0 md:block lg:w-72">
            <label htmlFor="admin-q" className="sr-only">
              Search players by email, phone, ID or referral code
            </label>
            <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fog" />
            <input
              id="admin-q"
              name="q"
              type="search"
              placeholder="Search players, IDs, codes"
              maxLength={80}
              className="h-9 w-full rounded-lg border border-line bg-ink-700 pl-8 pr-3 text-sm text-white outline-none transition placeholder:text-fog/70 focus:border-lime focus:ring-2 focus:ring-lime/25"
            />
          </form>

          <Link
            href="/admin/system"
            aria-label="System alerts"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fog transition-colors duration-150 hover:bg-ink-500 hover:text-white"
          >
            <Bell size={20} strokeWidth={1.75} />
          </Link>

          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fog transition-colors duration-150 hover:bg-ink-500 hover:text-white"
          >
            {theme === "dark" ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
          </button>

          {/* Profile menu — same <details> pattern the console already uses for Export. */}
          <details className="relative shrink-0">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-lg px-1 transition-colors duration-150 hover:bg-ink-500 [&::-webkit-details-marker]:hidden">
              <Avatar name={user} size="h-7 w-7 text-[10px]" />
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="text-fog" />
              <span className="sr-only">Account menu</span>
            </summary>
            <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-line bg-ink-700 p-1 shadow-lift">
              <div className="border-b border-line px-3 py-2">
                <div className="truncate text-sm font-semibold text-white">{user}</div>
                <div className="truncate text-xs text-fog">{roleLabel}</div>
              </div>
              <Link href="/account" className="block rounded px-3 py-2 text-sm text-white hover:bg-ink-500">
                Account
              </Link>
              <Link href="/" className="block rounded px-3 py-2 text-sm text-white hover:bg-ink-500">
                Back to site
              </Link>
              <button onClick={logout} className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-danger/90 hover:bg-danger/10">
                Log out
              </button>
            </div>
          </details>
        </header>

        <main className="min-w-0 flex-1 space-y-5 px-4 pb-16 pt-5 lg:px-8 lg:pt-7">{children}</main>
      </div>

      {/* ---- Mobile drawer ---- */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Dim overlay (no blur, per spec). */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label="Admin menu" className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-line bg-ink-800 shadow-lift">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <RailHeader collapsed={false} roleBadge={roleBadge} inline />
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="grid h-11 w-11 place-items-center rounded-lg text-fog hover:bg-ink-500 hover:text-white">
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

function RailHeader({ collapsed, roleBadge, inline = false }: { collapsed: boolean; roleBadge: string; inline?: boolean }) {
  return (
    <div className={inline ? "flex items-center gap-2" : "flex h-14 items-center gap-2 border-b border-line px-4"}>
      <BrandMark size={24} />
      {!collapsed && (
        <>
          <span className="font-display text-sm font-bold tracking-wide text-white">Console</span>
          {/* Quiet role badge — tinted text, no competing box. */}
          <span className="ml-1 rounded bg-lime/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime">{roleBadge}</span>
        </>
      )}
    </div>
  );
}

function NavList({ sections, collapsed, active }: { sections: NavSection[]; collapsed: boolean; active: (href: string) => boolean }) {
  return (
    <nav aria-label="Admin" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2.5 py-4 [scrollbar-width:thin]">
      {sections.map((section) => (
        <div key={section.label}>
          {!collapsed && <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fog/80">{section.label}</div>}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Ico = ICONS[item.icon] ?? LayoutDashboard;
              const on = active(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150 ${
                      collapsed ? "justify-center" : ""
                    } ${on ? "bg-lime/10 text-lime" : "text-fog hover:bg-ink-500 hover:text-white"}`}
                  >
                    {/* 3px accent bar on the active item's left edge (no solid pill). */}
                    {on && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-lime" aria-hidden />}
                    <Ico size={20} strokeWidth={1.75} className="shrink-0" aria-hidden />
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
  return (
    <div className="shrink-0 border-t border-line px-2.5 py-3">
      {!collapsed && (
        <div className="flex items-center gap-2.5 px-1.5 pb-2">
          <Avatar name={user} size="h-8 w-8 text-xs" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{user}</div>
            <div className="truncate text-xs text-fog">{roleLabel}</div>
          </div>
        </div>
      )}
      <Link
        href="/"
        title={collapsed ? "Back to site" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-fog transition-colors duration-150 hover:bg-ink-500 hover:text-white ${collapsed ? "justify-center" : ""}`}
      >
        <ArrowLeft size={20} strokeWidth={1.75} className="shrink-0" aria-hidden />
        {!collapsed && "Back to site"}
      </Link>
      <button
        onClick={logout}
        title={collapsed ? "Log out" : undefined}
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-danger/80 transition-colors duration-150 hover:bg-danger/10 hover:text-danger ${collapsed ? "justify-center" : ""}`}
      >
        <LogOut size={20} strokeWidth={1.75} className="shrink-0" aria-hidden />
        {!collapsed && "Log out"}
      </button>
    </div>
  );
}
