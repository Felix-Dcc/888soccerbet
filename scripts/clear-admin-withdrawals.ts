/**
 * One-off: clear an admin's withdrawal history — the PaymentIntent records shown in the wallet
 * and admin transaction lists. Balances are NOT touched: they come from the ledger, which this
 * script leaves exactly as it is, so this only removes the visible withdrawal rows.
 *
 *   npx tsx scripts/clear-admin-withdrawals.ts [name]            # dry run: prints what it would remove
 *   npx tsx scripts/clear-admin-withdrawals.ts [name] --confirm  # deletes them
 *
 * Against the LIVE site, run it through Railway so it uses the production database:
 *   railway run npx tsx scripts/clear-admin-withdrawals.ts Element            # dry run on prod
 *   railway run npx tsx scripts/clear-admin-withdrawals.ts Element --confirm  # apply on prod
 *
 * The name defaults to "Element". Pending withdrawals are never deleted (their money is still
 * held) — settle them first; the dry run lists any it is keeping.
 */
import { prisma } from "../src/lib/db";

const ghs = (p: bigint) => `GHS ${(Number(p) / 100).toFixed(2)}`;

async function findAdmin(name: string) {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
      OR: [{ displayName: { equals: name, mode: "insensitive" } }, { adminUsername: { equals: name, mode: "insensitive" } }],
    },
    select: { id: true, email: true, displayName: true, adminUsername: true },
  });
  if (admins.length === 0) throw new Error(`No admin found matching "${name}".`);
  if (admins.length > 1) throw new Error(`Several admins match "${name}": ${admins.map((a) => a.email).join(", ")}. Use a more specific name.`);
  return admins[0]!;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const name = process.argv.slice(2).find((a) => a !== "--confirm") ?? "Element";

  const admin = await findAdmin(name);
  const withdrawals = await prisma.paymentIntent.findMany({
    where: { userId: admin.id, direction: "WITHDRAWAL" },
    orderBy: { createdAt: "desc" },
    select: { id: true, ref: true, status: true, amount: true, createdAt: true },
  });
  const pending = withdrawals.filter((w) => w.status === "PENDING");
  const removable = withdrawals.filter((w) => w.status !== "PENDING");

  console.log(`Admin: ${admin.displayName ?? admin.adminUsername ?? admin.email} <${admin.email}>`);
  console.log(`Withdrawal records found: ${withdrawals.length}\n`);
  for (const w of removable) console.log(`  remove  ${w.ref}  ${w.status}  ${ghs(w.amount)}  ${w.createdAt.toISOString().slice(0, 10)}`);
  if (removable.length === 0) console.log("  (no settled withdrawals to remove)");
  if (pending.length) {
    console.log(`\nKEPT — pending, money still held (settle these first):`);
    for (const w of pending) console.log(`  keep    ${w.ref}  PENDING  ${ghs(w.amount)}`);
  }
  console.log(`\nTo delete: ${removable.length}    Kept (pending): ${pending.length}`);
  console.log(`Balances are not affected — the ledger is left as is.`);

  if (!confirm) {
    console.log(`\nDry run — nothing was changed. Re-run with --confirm to delete the ${removable.length} record(s).`);
    return;
  }
  if (removable.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }
  const r = await prisma.paymentIntent.deleteMany({ where: { id: { in: removable.map((w) => w.id) } } });
  console.log(`\nDone: deleted ${r.count} withdrawal record(s). Pending ones (${pending.length}) were left alone, balances unchanged.`);
}

main()
  .catch((e) => {
    console.error("FAILED — nothing was changed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
