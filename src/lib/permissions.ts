/**
 * Admin permissions: module.action strings, denied unless granted. SUPER_ADMIN holds all of them.
 * An ADMIN's access = their role's permissions + their own grants - their own denials.
 *
 * Admin and role management is super-admin only and can't be granted, so no admin can raise
 * their own access, create another super admin, or edit privileges.
 */
import type { Role } from "@prisma/client";

export const PERMISSIONS = {
  "dashboard.view": "See the admin dashboard",
  "reports.view": "See global financial reports and the control center",
  "reports.export": "Export reports as CSV",
  "users.view": "Search and view any player",
  "users.suspend": "Suspend and reactivate players",
  "wallets.adjust": "Correct a player's balance with a ledger adjustment",
  "bets.view": "See bets and settlement status",
  "payments.view": "See deposits and withdrawals",
  "verification.review": "Approve or reject withdrawal verification",
  "settlement.manage": "Settle and void matches",
  "fixtures.manage": "Add manual games",
  "odds.sync": "Run the odds sync and settle job",
  "referrals.view": "See your own referred players and their activity",
  "referrals.view_all": "See every admin's referral network",
  "admins.view": "See administrators and their performance",
  "audit_logs.view": "Read the audit log",
  "system.view": "See system health and provider status",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const isPermission = (p: string): p is Permission => p in PERMISSIONS;

/** Things only a super admin does; never grantable. */
export type SuperAction = "admins.manage" | "roles.manage";

export interface StaffLike {
  role: Role;
  permGrants: string[];
  permDenials: string[];
  adminRole?: { permissions: string[] } | null;
}

export const isStaff = (u: { role: Role }) => u.role === "ADMIN" || u.role === "SUPER_ADMIN";

/** Effective permissions. Unknown strings in stored data are ignored, never honoured. */
export function effectivePermissions(u: StaffLike): Set<Permission> {
  if (u.role === "SUPER_ADMIN") return new Set(ALL_PERMISSIONS);
  if (u.role !== "ADMIN") return new Set();
  const out = new Set<Permission>();
  for (const p of [...(u.adminRole?.permissions ?? []), ...u.permGrants]) if (isPermission(p)) out.add(p);
  for (const p of u.permDenials) if (isPermission(p)) out.delete(p);
  return out;
}

export const can = (u: StaffLike, p: Permission | SuperAction) =>
  p === "admins.manage" || p === "roles.manage" ? u.role === "SUPER_ADMIN" : effectivePermissions(u).has(p);

/** Keep only real permission strings (input from forms). */
export const cleanPermissions = (ps: string[]) => [...new Set(ps.filter(isPermission))];

const MODULE_LABELS: Record<string, string> = { users: "Players", admins: "Team", audit_logs: "Audit" };

/** The catalog grouped by module ("users.view" -> Players), in catalog order, for permission screens. */
export const permissionGroups = () =>
  Object.entries(
    ALL_PERMISSIONS.reduce<Record<string, Permission[]>>((g, p) => {
      const m = p.split(".")[0]!;
      (g[m] ??= []).push(p);
      return g;
    }, {}),
  ).map(([m, perms]) => ({ label: MODULE_LABELS[m] ?? m[0]!.toUpperCase() + m.slice(1), perms }));
