import "server-only";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, type CurrentUser } from "./session";
import { can, isStaff, type Permission, type SuperAction } from "./permissions";
import type { IconName } from "@/components/admin/kit";

/**
 * Page-level access for /admin: signed-out visitors go to login, players and admins without any
 * of the listed permissions get a "no access" screen. (The API routes enforce the same rules on
 * their own; this only decides what a page renders.)
 */
export async function adminPage(anyOf: (Permission | SuperAction)[] = []): Promise<{ ok: true; user: CurrentUser } | { ok: false; deny: React.ReactNode }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user) || (anyOf.length > 0 && !anyOf.some((p) => can(user, p)))) {
    return {
      ok: false,
      deny: (
        <div className="card mx-auto max-w-md p-8 text-center">
          <h1 className="font-display text-lg font-bold text-white">No access</h1>
          <p className="mt-2 text-sm text-fog">Your admin account doesn&apos;t include this section.</p>
          <Link href={isStaff(user) ? "/admin" : "/"} className="btn-ghost mt-4 inline-flex px-4 py-2 text-sm">
            Back
          </Link>
        </div>
      ),
    };
  }
  return { ok: true, user };
}

export const NAV: { href: string; label: string; icon: IconName; anyOf: (Permission | SuperAction)[] }[] = [
  { href: "/admin", label: "Command", icon: "command", anyOf: [] },
  { href: "/admin/referrals", label: "My referrals", icon: "referral", anyOf: ["referrals.view"] },
  { href: "/admin/users", label: "Players", icon: "players", anyOf: ["users.view", "referrals.view", "referrals.view_all"] },
  { href: "/admin/operations", label: "Trading desk", icon: "desk", anyOf: ["settlement.manage", "fixtures.manage", "verification.review", "odds.sync", "bets.view", "payments.payout"] },
  { href: "/admin/admins", label: "Team", icon: "team", anyOf: ["admins.view"] },
  { href: "/admin/roles", label: "Permissions", icon: "roles", anyOf: ["roles.manage"] },
  { href: "/admin/audit", label: "Audit trail", icon: "audit", anyOf: ["audit_logs.view"] },
  { href: "/admin/system", label: "System", icon: "system", anyOf: ["system.view"] },
];

export const visibleNav = (user: CurrentUser) => NAV.filter((n) => n.anyOf.length === 0 || n.anyOf.some((p) => can(user, p)));
