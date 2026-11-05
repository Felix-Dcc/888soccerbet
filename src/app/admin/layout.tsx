import { getCurrentUser } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { visibleNav } from "@/lib/adminPage";
import { AdminShell, type NavSection } from "@/components/admin/AdminShell";
import { ADMIN_THEME_SCRIPT } from "@/lib/theme";

export const dynamic = "force-dynamic";

/** Group the permitted sections into labelled blocks, and give each a Lucide icon key. */
const GROUPS: { label: string; hrefs: string[] }[] = [
  { label: "Overview", hrefs: ["/admin"] },
  { label: "Operations", hrefs: ["/admin/operations", "/admin/games"] },
  { label: "Growth & Content", hrefs: ["/admin/referrals"] },
  { label: "Administration", hrefs: ["/admin/users", "/admin/admins", "/admin/roles", "/admin/audit", "/admin/system"] },
];
const ICON_KEY: Record<string, string> = {
  "/admin": "dashboard",
  "/admin/operations": "operations",
  "/admin/games": "games",
  "/admin/referrals": "referrals",
  "/admin/users": "players",
  "/admin/admins": "team",
  "/admin/roles": "roles",
  "/admin/audit": "audit",
  "/admin/system": "system",
};

/** Console frame: grouped collapsible rail on desktop, slide-in drawer on phones. Each page re-checks access. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return <div className="mx-auto max-w-[1280px] px-4 py-8">{children}</div>; // the page redirects or refuses

  const nav = visibleNav(user);
  const byHref = new Map(nav.map((n) => [n.href, n]));
  const sections: NavSection[] = GROUPS.map((g) => ({
    label: g.label,
    items: g.hrefs.filter((h) => byHref.has(h)).map((h) => ({ href: h, label: byHref.get(h)!.label, icon: ICON_KEY[h] ?? "dashboard" })),
  })).filter((s) => s.items.length > 0);

  const name = user.displayName ?? user.email;
  const roleLabel = user.role === "SUPER_ADMIN" ? "Super admin" : (user.adminRole?.name ?? "Admin");

  return (
    <>
      {/* Sets the saved console theme before paint, so there's no flash of the wrong theme. */}
      <script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_SCRIPT }} />
      <AdminShell sections={sections} user={name} roleLabel={roleLabel} roleBadge={roleLabel}>
        {children}
      </AdminShell>
    </>
  );
}
