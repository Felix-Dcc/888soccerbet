/**
 * One-off: get back into the super admin account when its login is refused.
 *
 *   npx tsx scripts/reset-super-admin.ts [email]            # check only: shows what it finds, changes nothing
 *   npx tsx scripts/reset-super-admin.ts [email] --confirm  # asks for a new password and sets it
 *
 * Against the LIVE site, run it through Railway's Postgres service, whose public address it uses
 * (the app's own address only resolves inside Railway):
 *   railway run --service Postgres npx tsx scripts/reset-super-admin.ts
 *   railway run --service Postgres npx tsx scripts/reset-super-admin.ts --confirm
 *
 * The email defaults to admin@betzone.com.co. With --confirm the account is made an active
 * SUPER_ADMIN with the new password: an account still on the old 888soccerbet.com address is moved
 * to the new one, and if neither exists it is created. Balances and history are untouched.
 */
import { createInterface } from "node:readline/promises";

// Must be set before the database client loads, hence the dynamic imports in main().
if (process.env.DATABASE_PUBLIC_URL) process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const email = (args.find((a) => !a.startsWith("--")) ?? "admin@betzone.com.co").toLowerCase();
const oldEmail = email.replace(/@betzone\.com\.co$/, "@888soccerbet.com");
const show = (u: { email: string; phone: string | null; role: string; status: string; lastLoginAt: Date | null } | null) =>
  u ? `${u.email} · phone ${u.phone ?? "-"} · ${u.role} · ${u.status} · last login ${u.lastLoginAt?.toISOString() ?? "never"}` : "none";
const select = { id: true, email: true, phone: true, role: true, status: true, lastLoginAt: true } as const;

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/auth");
  const { newAdminReferralCode } = await import("../src/lib/admins");
  console.log(`Database: ${new URL(process.env.DATABASE_URL ?? "postgres://unset").host}`);
  const current = await prisma.user.findUnique({ where: { email }, select });
  const old = oldEmail === email ? null : await prisma.user.findUnique({ where: { email: oldEmail }, select });
  const supers = await prisma.user.findMany({ where: { role: "SUPER_ADMIN" }, select });
  console.log(`${email}: ${show(current)}`);
  if (old) console.log(`${oldEmail}: ${show(old)}`);
  console.log(`All super admins (${supers.length}):\n${supers.map((u) => "  " + show(u)).join("\n") || "  none"}`);
  if (!confirm) return console.log("\nCheck only. Add --confirm to set a new password.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = (await rl.question(`New password for ${email} (8+ characters): `)).trim();
  rl.close();
  if (password.length < 8) throw new Error("Password must be at least 8 characters; nothing changed");

  const data = { passwordHash: hashPassword(password), role: "SUPER_ADMIN" as const, status: "ACTIVE" as const };
  const target = current ?? old;
  const user = target
    ? await prisma.user.update({ where: { id: target.id }, data: { ...data, email }, select })
    : await prisma.user.create({
        data: { ...data, email, displayName: "Bet Zone Admin", kycStatus: "VERIFIED", referralCode: newAdminReferralCode() },
        select,
      });
  console.log(`Done: ${show(user)}. Log in with ${email} and the new password.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => (await import("../src/lib/db")).prisma.$disconnect());
