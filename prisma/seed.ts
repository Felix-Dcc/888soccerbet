/** Seed: house accounts, an admin, a demo player with a starting balance, and fixtures. */
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { houseAccountId, userAccountId, postTransaction } from "../src/lib/ledger";
import { toPesewas } from "../src/lib/money";
import { syncFixtures } from "../src/lib/sync";
import { newAdminReferralCode } from "../src/lib/admins";

async function main() {
  // House singleton accounts.
  await houseAccountId(prisma, "HOUSE_CASH");
  await houseAccountId(prisma, "HOUSE_PNL");
  await houseAccountId(prisma, "PAYMENT_CLEARING");

  // Databases seeded before the Bet Zone rename keep their accounts, moved to the new addresses.
  for (const who of ["admin", "demo"])
    await prisma.user.updateMany({ where: { email: `${who}@888soccerbet.com` }, data: { email: `${who}@betzone.com.co` } });

  const admin = await prisma.user.upsert({
    where: { email: "admin@betzone.com.co" },
    create: {
      email: "admin@betzone.com.co",
      passwordHash: hashPassword("Admin123!"),
      role: "SUPER_ADMIN",
      displayName: "Bet Zone Admin",
      kycStatus: "VERIFIED",
      dateOfBirth: new Date("1990-01-01"),
      phone: "0240000002",
      referralCode: newAdminReferralCode(),
    },
    update: { role: "SUPER_ADMIN", phone: "0240000002" },
  });

  const demo = await prisma.user.upsert({
    where: { email: "demo@betzone.com.co" },
    create: {
      email: "demo@betzone.com.co",
      passwordHash: hashPassword("Demo1234!"),
      displayName: "Demo Player",
      kycStatus: "VERIFIED",
      dateOfBirth: new Date("1995-06-15"),
      phone: "0240000001",
      referralCode: "DEMOBZ",
    },
    update: { phone: "0240000001", referralCode: "DEMOBZ" },
  });

  // Give the demo player a starting balance via a proper DEPOSIT ledger transaction.
  const already = await prisma.ledgerTransaction.findUnique({ where: { reference: "seed_deposit:demo" } });
  if (!already) {
    const cash = await userAccountId(prisma, demo.id, "USER_CASH");
    const clearing = await houseAccountId(prisma, "PAYMENT_CLEARING");
    await postTransaction(prisma, "DEPOSIT", "seed_deposit:demo", [
      { accountId: clearing, amount: -toPesewas(500) },
      { accountId: cash, amount: toPesewas(500) },
    ], { note: "seed starting balance" });
  }

  const sync = await syncFixtures();
  console.log("Seeded:", { admin: admin.email, demo: demo.email, ...sync });
  console.log("Logins -> admin@betzone.com.co or 0240000002 / Admin123!   demo@betzone.com.co or 0240000001 / Demo1234!   demo referral: /register?ref=DEMOBZ");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
