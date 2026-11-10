import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./auth";
import { newAdminReferralCode } from "./admins";
import { audit } from "./audit";

/**
 * Make sure a super admin with this email and password exists and is active: created if missing,
 * otherwise its role, status and password are put back to these. Nothing is written when it already
 * matches. Used at start-up from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD, so the password lives only
 * in the host's settings, never in the code.
 */
export async function ensureSuperAdmin(emailIn: string, password: string): Promise<"created" | "updated" | "unchanged"> {
  const email = emailIn.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("SUPER_ADMIN_EMAIL is not a valid email");
  if (password.length < 8) throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters");

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (user.role === "SUPER_ADMIN" && user.status === "ACTIVE" && verifyPassword(password, user.passwordHash)) return "unchanged";
    await prisma.user.update({ where: { id: user.id }, data: { role: "SUPER_ADMIN", status: "ACTIVE", passwordHash: hashPassword(password) } });
    await audit({ actorUserId: null, action: "SUPER_ADMIN_ENSURE", targetType: "User", targetId: user.id, before: { role: user.role, status: user.status }, after: { role: "SUPER_ADMIN", status: "ACTIVE", passwordReset: true } });
    return "updated";
  }
  const usernameFree = !(await prisma.user.findUnique({ where: { adminUsername: "superadmin" }, select: { id: true } }));
  const created = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      role: "SUPER_ADMIN",
      displayName: "Bet Zone Super Admin",
      adminUsername: usernameFree ? "superadmin" : null,
      kycStatus: "VERIFIED",
      referralCode: newAdminReferralCode(),
    },
  });
  await audit({ actorUserId: null, action: "SUPER_ADMIN_ENSURE", targetType: "User", targetId: created.id, after: { email, role: "SUPER_ADMIN" } });
  return "created";
}
