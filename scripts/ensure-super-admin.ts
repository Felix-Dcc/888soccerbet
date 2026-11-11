/**
 * Runs before the web app starts (package.json "start"). When SUPER_ADMIN_EMAIL and
 * SUPER_ADMIN_PASSWORD are set (Railway > web > Variables), that super admin is created, or its
 * password put back to the variable. Never stops the site from starting: problems are only logged.
 */
import { ensureSuperAdmin } from "../src/lib/superAdmin";
import { prisma } from "../src/lib/db";

const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;

(async () => {
  if (!email || !password) return;
  try {
    console.log(`[super-admin] ${email}: ${await ensureSuperAdmin(email, password)}`);
  } catch (e) {
    console.error("[super-admin] skipped:", e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
})();
