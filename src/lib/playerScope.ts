import type { Prisma } from "@prisma/client";
import { can, type StaffLike } from "./permissions";

/**
 * The players a staff member may list, as a database filter (applied in the query, not after):
 * everyone with users.view; otherwise their own referrals, plus any admin's with referrals.view_all.
 * Returns null when they may list none.
 */
export function playerScopeWhere(staff: StaffLike & { id: string }): Prisma.UserWhereInput | null {
  if (can(staff, "users.view")) return { role: "USER" };
  const or: Prisma.UserWhereInput[] = [];
  if (can(staff, "referrals.view")) or.push({ referredById: staff.id });
  if (can(staff, "referrals.view_all")) or.push({ referredBy: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  return or.length ? { role: "USER", OR: or } : null;
}
