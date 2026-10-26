/**
 * One-off: clear the demo data left over from building and testing, keeping real money.
 *
 *   npx tsx scripts/cleanup-demo.ts            # dry run: prints exactly what it would remove
 *   npx tsx scripts/cleanup-demo.ts --confirm  # does it, in one transaction, with checks
 *
 * The rules and the safety checks live in src/lib/demoCleanup.ts.
 */
import { prisma } from "../src/lib/db";
import { planDemoCleanup, runDemoCleanup, type CleanupPlan } from "../src/lib/demoCleanup";

const ghs = (p: bigint) => `GHS ${(Number(p) / 100).toFixed(2)}`;
const list = (xs: string[], n = 6) => (xs.length === 0 ? "none" : xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} … +${xs.length - n} more`);

function show(p: CleanupPlan) {
  console.log("REAL MONEY (kept)");
  for (const r of p.realPayments) console.log(`  ${r.provider} ${r.direction} ${r.status} ${ghs(r.amount)}  ${r.email}`);
  if (!p.realPayments.length) console.log("  none found — there is no real money to keep");
  for (const k of p.keptPlayers)
    console.log(`  keeps ${k.email}: balance ${ghs(k.balanceAfter)} (real payments total ${ghs(k.realPaymentsTotal)})${k.balanceAfter === k.realPaymentsTotal ? "" : "  <-- check this"}`);
  console.log(`  staff kept:   ${list(p.keptStaff)}`);
  console.log("\nTO REMOVE");
  console.log(`  demo payments:          ${p.demoPayments.count}  (${ghs(p.demoPayments.total)} of fake money)`);
  console.log(`  bets:                   ${p.bets}`);
  console.log(`  ledger transactions:    ${p.ledger.remove} of ${p.ledger.remove + p.ledger.keep}  (keeping ${p.ledger.keep})`);
  console.log(`  demo accounts deleted:  ${p.deleteAccounts.length}  ${list(p.deleteAccounts)}`);
  console.log(`  demo accounts closed:   ${p.closeAccounts.length}  ${list(p.closeAccounts)}  (named in the audit trail, which can't be edited)`);
  console.log(`  generated/manual games: ${p.manualFixtures}`);
  console.log(`  sandbox webhook events: ${p.sandboxWebhooks}`);
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    show(await planDemoCleanup());
    console.log("\nDry run — nothing was changed. Re-run with --confirm to apply.");
    return;
  }
  show(await runDemoCleanup());
  console.log("\nDone: the ledger still balances and every balance matches real payments only.");
}

main()
  .catch((e) => {
    console.error("FAILED — nothing was changed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
