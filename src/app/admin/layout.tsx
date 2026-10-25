import { getCurrentUser } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { visibleNav } from "@/lib/adminPage";
import { AdminNavLinks } from "@/components/admin/AdminNavLinks";
import { Avatar } from "@/components/admin/kit";
import { CrownMark } from "@/components/Logo";

export const dynamic = "force-dynamic";

/** Console frame: left rail on desktop (scrolling bar on phones) showing only permitted sections; each page re-checks access. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return <div className="mx-auto max-w-[1280px] px-4 py-8">{children}</div>; // the page redirects or refuses
  const nav = visibleNav(user).map(({ href, label, icon }) => ({ href, label, icon }));
  const name = user.displayName ?? user.email;
  return (
    <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      {/* min-w-0: on phones the menu is one sideways-scrolling row; without it the grid column grows to fit every link and widens the page. */}
      <aside className="min-w-0 border-b border-white/[0.06] bg-[#0C1117] lg:sticky lg:top-[60px] lg:flex lg:h-[calc(100vh-60px)] lg:flex-col lg:border-b-0 lg:border-r">
        <div className="hidden items-center gap-2 px-5 pb-3 pt-5 lg:flex">
          <CrownMark size={22} />
          <span className="font-display text-sm font-bold tracking-wide text-white">Console</span>
        </div>
        <AdminNavLinks items={nav} />
        <div className="mt-auto hidden items-center gap-3 border-t border-white/[0.06] px-5 py-4 lg:flex">
          <Avatar name={name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{name}</div>
            <div className="text-xs text-fog">{user.role === "SUPER_ADMIN" ? "Super admin" : (user.adminRole?.name ?? "Admin")}</div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 space-y-5 px-4 pb-16 pt-5 lg:px-8 lg:pt-7">{children}</div>
    </div>
  );
}
