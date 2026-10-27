/**
 * Integration tests — require a migrated database (DATABASE_URL). Run with:
 *   npm run db:migrate && npm run test:int
 * They cover the money-critical paths: concurrency, idempotency, settlement, reconciliation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { OddsProvider } from "../src/lib/providers/odds";

// Lets a test swap in a fake odds feed; everything else uses the configured provider.
const feed = vi.hoisted(() => ({ override: null as OddsProvider | null }));
vi.mock("../src/lib/providers/odds", async (load) => {
  const real = await load<typeof import("../src/lib/providers/odds")>();
  return { ...real, oddsProvider: () => feed.override ?? real.oddsProvider() };
});
// Lets a test swap in a fake payment provider (e.g. one that refuses payouts).
const psp = vi.hoisted(() => ({ override: null as import("../src/lib/providers/payments").PaymentProvider | null }));
vi.mock("../src/lib/providers/payments", async (load) => {
  const real = await load<typeof import("../src/lib/providers/payments")>();
  return { ...real, paymentProvider: () => psp.override ?? real.paymentProvider() };
});
// Capture emails instead of calling Brevo.
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("../src/lib/email", async (load) => {
  const real = await load<typeof import("../src/lib/email")>();
  return { ...real, sendEmail: async (m: { to: string; subject: string; text: string }) => (mail.sent.push(m), true) };
});
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { houseAccountId, userAccountId, postTransaction, userCashBalance, ledgerIsBalanced } from "../src/lib/ledger";
import { placeBet, BetError } from "../src/lib/betEngine";
import { setLiveScore, settleBet, settleFixture, voidFixture, SettlementError } from "../src/lib/settlement";
import { initiateDeposit, initiateWithdrawal, initiateVerificationPayment, confirmDeposit, manualPayoutQueue, processPaymentEvent, reconcilePendingDeposits, recordManualPayout, reviewVerification, verificationState } from "../src/lib/wallet";
import { toPesewas } from "../src/lib/money";
import { referralCode } from "../src/lib/ids";
import { createBooking, loadBooking, resolvePicks } from "../src/lib/bookings";
import { registerUser, findUserByIdentifier } from "../src/lib/accounts";
import { TERMS_VERSION } from "../src/lib/legal";
import { createAdmin, consumeAccessToken, formatReferralCode, issueResetLink, setAdminStatus, updateAdminAccess } from "../src/lib/admins";
import { parseRange, scopeMetrics } from "../src/lib/adminAnalytics";
import { adjustBalance, canViewPlayer } from "../src/lib/playerAdmin";
import { audit, verifyAuditChain } from "../src/lib/audit";
import { listFixtures, listResults, dataVersion } from "../src/lib/queries";
import { applyMarkets, goLiveManualFixtures, updateLiveScores } from "../src/lib/sync";
import { createManualFixture, rescheduleManualFixture } from "../src/lib/manualFixtures";
import { isTestAccount, planDemoCleanup, runDemoCleanup } from "../src/lib/demoCleanup";
import { manualFixtureSchema } from "../src/lib/validation";
import { generateMatch } from "../src/lib/matchGenerator";
import { advanceScriptedMatches, buildScript, scriptLengthMin } from "../src/lib/scriptedMatches";
import { markWinsSeen, unseenWins } from "../src/lib/wins";
import { ensureVerifyCode, ticketByVerifyCode, ticketByRef, ticketTotals } from "../src/lib/tickets";
import { cashOut, quoteForBet, runAutoCashouts, setAutoCashout } from "../src/lib/cashout";
import { confirmEmailCode, requestPasswordReset, requireVerifiedEmail, sendVerificationCode } from "../src/lib/emailFlows";

async function fundedUser(ghs: number) {
  const user = await prisma.user.create({
    data: { email: `t_${randomUUID()}@test.gh`, passwordHash: "x", dateOfBirth: new Date("1990-01-01"), referralCode: referralCode() },
  });
  if (ghs > 0) {
    const cash = await userAccountId(prisma, user.id, "USER_CASH");
    const clearing = await houseAccountId(prisma, "PAYMENT_CLEARING");
    await postTransaction(prisma, "DEPOSIT", `seed:${user.id}`, [
      { accountId: clearing, amount: -toPesewas(ghs) },
      { accountId: cash, amount: toPesewas(ghs) },
    ]);
  }
  return user;
}

let fixtureSeq = 0;
async function makeMatch(odds: { home: number; draw?: number; away: number }, startsAt = new Date(Date.now() + 3600_000)) {
  const sport = await prisma.sport.upsert({ where: { key: "football" }, create: { key: "football", name: "Football" }, update: {} });
  const comp = await prisma.competition.upsert({
    where: { sportKey_name: { sportKey: "football", name: "Test League" } },
    create: { sportKey: "football", name: "Test League" },
    update: {},
  });
  const fixture = await prisma.fixture.create({
    data: {
      sportKey: "football", competitionId: comp.id, homeTeam: `H${fixtureSeq}`, awayTeam: `A${fixtureSeq++}`,
      startsAt, status: "SCHEDULED", providerRef: `test-${randomUUID()}`,
    },
  });
  const market = await prisma.market.create({ data: { fixtureId: fixture.id, type: "MATCH_RESULT", name: "Match Result", status: "OPEN" } });
  const mk = (code: string, name: string, o: number) =>
    prisma.selection.create({ data: { marketId: market.id, code, name, milliOdds: Math.round(o * 1000), status: "OPEN" } });
  const home = await mk("1", "Home", odds.home);
  const draw = odds.draw ? await mk("X", "Draw", odds.draw) : null;
  const away = await mk("2", "Away", odds.away);
  return { fixture, market, home, draw, away };
}

beforeAll(async () => {
  await houseAccountId(prisma, "HOUSE_PNL");
  await houseAccountId(prisma, "PAYMENT_CLEARING");
});

describe("bet placement", () => {
  it("debits the stake and holds it in escrow", async () => {
    const user = await fundedUser(100);
    const { home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const bet = await placeBet(user.id, {
      idempotencyKey: randomUUID(),
      stakeGhs: 10,
      acceptOddsChange: false,
      selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }],
    });
    expect(bet.potentialPayout).toBe(2000n); // 10 @ 2.0 = 20
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90));
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("rejects insufficient funds", async () => {
    const user = await fundedUser(5);
    const { home } = await makeMatch({ home: 2.0, away: 4.0 });
    await expect(
      placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("rejects an odds change unless accepted, then accepts at the new price", async () => {
    const user = await fundedUser(100);
    const { home } = await makeMatch({ home: 2.0, away: 4.0 });
    await prisma.selection.update({ where: { id: home.id }, data: { milliOdds: 1800 } }); // drifted
    await expect(
      placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] }),
    ).rejects.toMatchObject({ code: "ODDS_CHANGED" });
    const bet = await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: true, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] });
    expect(bet.combinedMilliOdds).toBe(1800); // placed at the live price
  });

  it("rejects a suspended market", async () => {
    const user = await fundedUser(100);
    const { home, market } = await makeMatch({ home: 2.0, away: 4.0 });
    await prisma.market.update({ where: { id: market.id }, data: { status: "SUSPENDED" } });
    await expect(
      placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] }),
    ).rejects.toBeInstanceOf(BetError);
  });

  it("is idempotent: same key returns the same bet, debits once", async () => {
    const user = await fundedUser(100);
    const { home } = await makeMatch({ home: 2.0, away: 4.0 });
    const key = randomUUID();
    const body = { idempotencyKey: key, stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] };
    const a = await placeBet(user.id, body);
    const b = await placeBet(user.id, body);
    expect(a.ref).toBe(b.ref);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90)); // charged once
  });

  it("CONCURRENCY: parallel bets cannot overspend the balance", async () => {
    const user = await fundedUser(100);
    const { home } = await makeMatch({ home: 2.0, away: 4.0 });
    const attempts = Array.from({ length: 10 }, () =>
      placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 20, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] })
        .then(() => "ok" as const)
        .catch((e) => (e as BetError).code),
    );
    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r === "ok").length;
    expect(ok).toBe(5); // 100 / 20
    const bal = await userCashBalance(prisma, user.id);
    expect(bal).toBe(0n);
    expect(bal >= 0n).toBe(true);
    expect(await ledgerIsBalanced()).toBe(true);
  });
});

describe("settlement", () => {
  it("pays out a winning single and keeps the ledger balanced", async () => {
    const user = await fundedUser(100);
    const { fixture, home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(fixture.id, 2, 0); // home win
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    expect(bet.status).toBe("WON");
    // started 100, staked 10 (->90), won 20 back => 110
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(110));
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("keeps the stake on a loss", async () => {
    const user = await fundedUser(100);
    const { fixture, home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(fixture.id, 0, 2); // away win -> home bet loses
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90));
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("is idempotent: re-settling pays only once", async () => {
    const user = await fundedUser(100);
    const { fixture, home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const placed = await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(fixture.id, 2, 0);
    const betRow = await prisma.bet.findFirstOrThrow({ where: { ref: placed.ref } });
    const again = await settleBet(betRow.id); // retry
    expect(again).toBe(false);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(110)); // not 120
  });
});

describe("wallet", () => {
  it("credits a deposit only via webhook, and idempotently", async () => {
    const user = await fundedUser(0);
    const intent = await initiateDeposit(user.id, 50, "0241234567", randomUUID());
    expect(await userCashBalance(prisma, user.id)).toBe(0n); // not credited yet
    const ev = { providerEventId: `evt_${randomUUID()}`, ourRef: intent.ref, status: "SUCCEEDED" as const, amountPesewas: intent.amount };
    expect(await processPaymentEvent("sandbox", ev)).toBe("processed");
    expect(await processPaymentEvent("sandbox", ev)).toBe("duplicate"); // replayed callback
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(50)); // credited once
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("holds a withdrawal immediately and reverses it on failure", async () => {
    const user = await fundedUser(100);
    await prisma.user.update({ where: { id: user.id }, data: { kycStatus: "VERIFIED" } });
    const intent = await initiateWithdrawal(user.id, 40, "0241234567", randomUUID());
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(60)); // held
    const ev = { providerEventId: `evt_${randomUUID()}`, ourRef: intent.ref, status: "FAILED" as const, amountPesewas: intent.amount };
    await processPaymentEvent("sandbox", ev);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(100)); // refunded
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("never credits a deposit paid short or a payment of the wrong kind, and credits only what was asked", async () => {
    const user = await fundedUser(0);
    const intent = await initiateDeposit(user.id, 50, "0201234567", randomUUID());
    expect(intent.metadata).toMatchObject({ msisdn: "0201234567", network: "TELECEL" }); // network guessed from the prefix
    const base = { ourRef: intent.ref, status: "SUCCEEDED" as const };
    expect(await processPaymentEvent("sandbox", { ...base, providerEventId: `evt_${randomUUID()}`, amountPesewas: toPesewas(49.99) })).toBe("ignored"); // paid short
    expect(await processPaymentEvent("sandbox", { ...base, providerEventId: `evt_${randomUUID()}`, amountPesewas: intent.amount, direction: "WITHDRAWAL" })).toBe("ignored");
    expect(await userCashBalance(prisma, user.id)).toBe(0n);
    // Paid with the PSP's 2% fee on top: the player gets exactly the 50 they deposited.
    expect(await processPaymentEvent("sandbox", { ...base, providerEventId: `evt_${randomUUID()}`, amountPesewas: toPesewas(51), direction: "DEPOSIT" })).toBe("processed");
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(50));
  });

  it("gives the money back when the provider refuses a payout, and keeps it held when the outcome is unclear", async () => {
    const user = await fundedUser(100);
    await prisma.user.update({ where: { id: user.id }, data: { kycStatus: "VERIFIED" } });
    const fake = (initiate: import("../src/lib/providers/payments").PaymentProvider["initiate"]) =>
      ({ name: "sandbox", isSandbox: true, payouts: "api" as const, initiate, verifyWebhook: async () => ({ ok: false as const }) });
    try {
      psp.override = fake(async (r) => (r.direction === "WITHDRAWAL" ? { providerRef: null, status: "FAILED" } : { providerRef: null, status: "PENDING" }));
      await expect(initiateWithdrawal(user.id, 40, "0241234567", randomUUID())).rejects.toMatchObject({ code: "PAYOUT_REFUSED" });
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(100)); // returned at once
      psp.override = fake(async () => {
        throw new Error("timeout");
      });
      const unclear = await initiateWithdrawal(user.id, 40, "0241234567", randomUUID());
      expect(unclear.status).toBe("PENDING");
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(60)); // still held until the webhook says
    } finally {
      psp.override = null;
    }
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("holds withdrawals for a provider that can't pay out, until an admin records paid or failed, once", async () => {
    const sa = await prisma.user.create({ data: { email: `sa_${randomUUID()}@t.gh`, passwordHash: "x", role: "SUPER_ADMIN", referralCode: referralCode() } });
    const user = await fundedUser(100);
    await prisma.user.update({ where: { id: user.id }, data: { kycStatus: "VERIFIED" } });
    const initiate = vi.fn(async () => ({ providerRef: null, status: "PENDING" as const }));
    psp.override = { name: "shinobipay", isSandbox: true, payouts: "manual", initiate, verifyWebhook: async () => ({ ok: false }) };
    try {
      const paid = await initiateWithdrawal(user.id, 40, "0241234567", randomUUID());
      const refused = await initiateWithdrawal(user.id, 25, "0241234567", randomUUID());
      expect(initiate).not.toHaveBeenCalled(); // nobody asks the PSP to pay
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(35)); // both held
      expect((await manualPayoutQueue()).map((i) => i.ref)).toEqual(expect.arrayContaining([paid.ref, refused.ref]));

      await recordManualPayout(sa.id, paid.ref, "PAID");
      await expect(recordManualPayout(sa.id, paid.ref, "FAILED")).rejects.toMatchObject({ code: "ALREADY_DONE" }); // one decision
      await vi.waitFor(() => expect(mail.sent.some((m) => m.to === user.email && m.subject === "Withdrawal paid: GHS 40.00")).toBe(true));
      await recordManualPayout(sa.id, refused.ref, "FAILED");
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(60)); // 25 back, 40 gone
      const statuses = await prisma.paymentIntent.findMany({ where: { ref: { in: [paid.ref, refused.ref] } }, select: { ref: true, status: true } });
      expect(Object.fromEntries(statuses.map((i) => [i.ref, i.status]))).toEqual({ [paid.ref]: "SUCCEEDED", [refused.ref]: "FAILED" });
      expect(await prisma.auditLog.count({ where: { action: { in: ["PAYOUT_MARKED_PAID", "PAYOUT_MARKED_FAILED"] }, actorUserId: sa.id } })).toBe(2);
    } finally {
      psp.override = null;
    }
    // A payout the PSP is sending itself can never be marked by hand (that could pay twice).
    const auto = await initiateWithdrawal(user.id, 10, "0241234567", randomUUID());
    await expect(recordManualPayout(sa.id, auto.ref, "FAILED")).rejects.toMatchObject({ code: "NOT_MANUAL" });
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("credits a deposit whose webhook was lost once the provider confirms it, and never twice", async () => {
    const user = await fundedUser(0);
    const checkDeposit = vi.fn(async () => ({ status: "SUCCEEDED" as const, amountPesewas: toPesewas(1.02) })); // GHS 1 + 2% fee
    psp.override = {
      name: "shinobipay", isSandbox: false, payouts: "manual", checkDeposit,
      initiate: async () => ({ providerRef: `pi_${randomUUID().slice(0, 8)}`, status: "PENDING" as const }),
      verifyWebhook: async () => ({ ok: false as const }),
    };
    try {
      const intent = await initiateDeposit(user.id, 1, "0244123456", randomUUID());
      expect(await reconcilePendingDeposits(user.id)).toBe(0); // under a minute old: left for the webhook
      expect(checkDeposit).not.toHaveBeenCalled();
      await prisma.paymentIntent.update({ where: { id: intent.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
      expect(await reconcilePendingDeposits(user.id)).toBe(1);
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(1)); // exactly what was asked
      expect(await reconcilePendingDeposits(user.id)).toBe(0); // settled: not asked again
      // The webhook finally turns up: already settled, so nothing more is credited.
      const late = await processPaymentEvent("shinobipay", { providerEventId: `evt_${randomUUID()}`, ourRef: intent.ref, status: "SUCCEEDED", amountPesewas: toPesewas(1.02), direction: "DEPOSIT" });
      expect(late).toBe("ignored");
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(1));
    } finally {
      psp.override = null;
    }
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("confirms a deposit the moment the player taps 'I've approved it', once, and only their own", async () => {
    const user = await fundedUser(0);
    const other = await fundedUser(0);
    let outcome: { status: "SUCCEEDED" | "FAILED"; amountPesewas: bigint } | null = null;
    const checkDeposit = vi.fn(async () => outcome);
    psp.override = {
      name: "shinobipay", isSandbox: false, payouts: "manual", checkDeposit,
      initiate: async () => ({ providerRef: `pi_${randomUUID().slice(0, 8)}`, status: "PENDING" as const, prompt: { ussdFallback: null } }),
      verifyWebhook: async () => ({ ok: false as const }),
    };
    try {
      const intent = await initiateDeposit(user.id, 50, "0244123456", randomUUID());
      await expect(confirmDeposit(other.id, intent.ref)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await confirmDeposit(user.id, intent.ref)).toMatchObject({ status: "PENDING" }); // not approved yet
      outcome = { status: "SUCCEEDED", amountPesewas: toPesewas(51) };
      expect(await confirmDeposit(user.id, intent.ref)).toMatchObject({ status: "SUCCEEDED", amount: toPesewas(50) });
      expect(await confirmDeposit(user.id, intent.ref)).toMatchObject({ status: "SUCCEEDED" }); // tapped again
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(50)); // credited once
      expect(checkDeposit).toHaveBeenCalledTimes(2); // not asked again once settled

      const failed = await initiateDeposit(user.id, 20, "0244123456", randomUUID());
      outcome = { status: "FAILED", amountPesewas: toPesewas(20) };
      expect(await confirmDeposit(user.id, failed.ref)).toMatchObject({ status: "FAILED" });
      expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(50));
    } finally {
      psp.override = null;
    }
  });

  it("blocks a withdrawal above balance", async () => {
    const user = await fundedUser(10);
    await prisma.user.update({ where: { id: user.id }, data: { kycStatus: "VERIFIED" } });
    await expect(initiateWithdrawal(user.id, 50, "0241234567", randomUUID())).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });
});

describe("minimums and withdrawal verification", () => {
  // The int config lowers both minimums to GHS 1 for the other tests; restore the real ones here.
  const withEnv = async (vars: Record<string, string>, fn: () => Promise<void>) => {
    const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    Object.assign(process.env, vars);
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
  };
  const succeed = (intent: { ref: string; amount: bigint }) =>
    processPaymentEvent("sandbox", { providerEventId: `evt_${randomUUID()}`, ourRef: intent.ref, status: "SUCCEEDED", amountPesewas: intent.amount });
  const pay = async (userId: string) => succeed(await initiateVerificationPayment(userId, "0241234567", randomUUID()));
  // A real winning single at 2.00 paying out `payoutGhs`; the winnings land in the player's cash.
  const win = async (userId: string, payoutGhs: number) => {
    const stake = toPesewas(payoutGhs / 2);
    const [cash, clearing] = [await userAccountId(prisma, userId, "USER_CASH"), await houseAccountId(prisma, "PAYMENT_CLEARING")];
    await postTransaction(prisma, "DEPOSIT", `seed:${randomUUID()}`, [{ accountId: clearing, amount: -stake }, { accountId: cash, amount: stake }]);
    const { fixture, home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await placeBet(userId, { idempotencyKey: randomUUID(), stakeGhs: payoutGhs / 2, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(fixture.id, 1, 0);
  };

  it("isn't needed until a win pays out over GHS 1000", async () => {
    const user = await fundedUser(0);
    await win(user.id, 1000); // exactly 1000: not over
    expect(await verificationState(user.id)).toMatchObject({ required: false });
    await expect(initiateVerificationPayment(user.id, "0241234567", randomUUID())).rejects.toMatchObject({ code: "NOT_REQUIRED" });
    await initiateWithdrawal(user.id, 100, "0241234567", randomUUID()); // unverified, but allowed
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(900));

    await win(user.id, 1002);
    expect(await verificationState(user.id)).toMatchObject({ required: true, paid: 0 });
    await expect(initiateWithdrawal(user.id, 100, "0241234567", randomUUID())).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("rejects a deposit under GHS 50 and a stake under GHS 250", async () => {
    await withEnv({ MIN_DEPOSIT_GHS: "50", MIN_STAKE_GHS: "250" }, async () => {
      const user = await fundedUser(1000);
      await expect(initiateDeposit(user.id, 49, "0241234567", randomUUID())).rejects.toMatchObject({ code: "DEPOSIT_TOO_LOW" });
      await expect(initiateDeposit(user.id, 50, "0241234567", randomUUID())).resolves.toMatchObject({ status: "PENDING" });
      const { home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
      const bet = (stakeGhs: number) =>
        placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] });
      await expect(bet(249)).rejects.toBeInstanceOf(BetError);
      await expect(bet(250)).resolves.toBeTruthy();
    });
  });

  it("doesn't count a normal deposit, holds two payments, then approval releases them and unlocks withdrawals", async () => {
    const user = await fundedUser(0);
    await win(user.id, 1002); // cash 1002
    await succeed(await initiateDeposit(user.id, 500, "0241234567", randomUUID())); // normal deposit
    expect(await verificationState(user.id)).toMatchObject({ paid: 0, status: "UNVERIFIED" });
    await expect(initiateWithdrawal(user.id, 100, "0241234567", randomUUID())).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });

    await pay(user.id);
    expect(await verificationState(user.id)).toMatchObject({ paid: 1, held: toPesewas(500), status: "UNVERIFIED" }); // bar half full
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(1502)); // held, not spendable
    await expect(reviewVerification(user.id, true)).rejects.toMatchObject({ code: "NOT_READY" });

    await pay(user.id);
    expect(await verificationState(user.id)).toMatchObject({ paid: 2, held: toPesewas(1000), status: "PENDING" }); // bar full
    await expect(initiateVerificationPayment(user.id, "0241234567", randomUUID())).rejects.toMatchObject({ code: "AWAITING_REVIEW" });
    await expect(initiateWithdrawal(user.id, 100, "0241234567", randomUUID())).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });

    expect(await reviewVerification(user.id, true)).toEqual({ released: toPesewas(1000) });
    expect(await verificationState(user.id)).toMatchObject({ held: 0n, status: "VERIFIED" });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(2502));
    await expect(initiateVerificationPayment(user.id, "0241234567", randomUUID())).rejects.toMatchObject({ code: "ALREADY_VERIFIED" });
    await initiateWithdrawal(user.id, 100, "0241234567", randomUUID());
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(2402));
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("rejection returns the held money and lets the player verify again", async () => {
    const user = await fundedUser(0);
    await win(user.id, 1002);
    await pay(user.id);
    expect(await reviewVerification(user.id, false)).toEqual({ released: toPesewas(500) });
    expect(await verificationState(user.id)).toMatchObject({ paid: 0, held: 0n, status: "REJECTED" });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(1502));
    await expect(reviewVerification(user.id, false)).rejects.toMatchObject({ code: "NOTHING_HELD" });
    await expect(initiateWithdrawal(user.id, 100, "0241234567", randomUUID())).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
    await pay(user.id);
    expect(await verificationState(user.id)).toMatchObject({ paid: 1 });
    expect(await ledgerIsBalanced()).toBe(true);
  });
});

describe("kick-off cut-off", () => {
  it("rejects a bet on a match that has started, even if its stored status is still SCHEDULED", async () => {
    const user = await fundedUser(100);
    const { home } = await makeMatch({ home: 2.0, away: 4.0 }, new Date(Date.now() - 60_000));
    await expect(
      placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] }),
    ).rejects.toMatchObject({ code: "MATCH_STARTED" });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(100)); // nothing debited
  });
});

describe("booking codes", () => {
  it("round-trips a slip and reloads at CURRENT odds", async () => {
    const a = await makeMatch({ home: 2.0, away: 4.0 });
    const b = await makeMatch({ home: 1.5, away: 3.0 });
    const code = await createBooking([a.home.id, b.away.id]);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    await prisma.selection.update({ where: { id: a.home.id }, data: { milliOdds: 2200 } }); // price moves after booking
    const loaded = await loadBooking(code.toLowerCase().replace(/(....)/, "$1 ")); // typed loosely
    expect(loaded.unavailable).toBe(0);
    expect(loaded.picks.map((p) => p.selectionId)).toEqual([a.home.id, b.away.id]);
    expect(loaded.picks[0]!.milliOdds).toBe(2200);
    expect(loaded.picks[0]!.fixtureName).toBe(`${a.fixture.homeTeam} v ${a.fixture.awayTeam}`);
  });

  it("reports legs that have since closed instead of loading them", async () => {
    const a = await makeMatch({ home: 2.0, away: 4.0 });
    const b = await makeMatch({ home: 1.5, away: 3.0 });
    const code = await createBooking([a.home.id, b.home.id]);
    await prisma.market.update({ where: { id: b.market.id }, data: { status: "SUSPENDED" } });
    const loaded = await loadBooking(code);
    expect(loaded.picks.map((p) => p.selectionId)).toEqual([a.home.id]);
    expect(loaded.unavailable).toBe(1);
  });

  it("refuses to book two legs on one match, a started match, or unknown selections", async () => {
    const a = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await expect(createBooking([a.home.id, a.away.id])).rejects.toMatchObject({ code: "CORRELATED_LEGS" });
    const started = await makeMatch({ home: 2.0, away: 4.0 }, new Date(Date.now() - 60_000));
    await expect(createBooking([started.home.id])).rejects.toMatchObject({ code: "MARKET_CLOSED" });
    await expect(createBooking(["does-not-exist"])).rejects.toMatchObject({ code: "SELECTION_NOT_FOUND" });
  });

  it("404s an unknown code", async () => {
    await expect(loadBooking("ZZZZZZZZ")).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND", status: 404 });
  });

  it("a booked slip places through the engine like any other", async () => {
    const user = await fundedUser(50);
    const a = await makeMatch({ home: 2.0, away: 4.0 });
    const { picks } = await loadBooking(await createBooking([a.home.id]));
    const bet = await placeBet(user.id, {
      idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false,
      selections: picks.map((p) => ({ selectionId: p.selectionId, expectedMilliOdds: p.milliOdds })),
    });
    expect(bet.potentialPayout).toBe(2000n);
  });
});

describe("accounts", () => {
  const unique = () => randomUUID().slice(0, 8);
  const phone = () => "05" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

  it("registers with a referral code, normalises the phone and allows phone or email login", async () => {
    const referrer = await registerUser({ email: `r_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: "1990-01-01" });
    // Players don't refer players: only an administrator's code is accepted.
    await expect(
      registerUser({ email: `x_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: "1990-01-01", referralCode: referrer.referralCode }),
    ).rejects.toMatchObject({ code: "BAD_REFERRAL" });
    await prisma.user.update({ where: { id: referrer.id }, data: { role: "ADMIN" } });
    const p = phone();
    const intl = "+233 " + p.slice(1);
    const user = await registerUser({
      name: "  Ama Mensah ",
      email: `U_${unique()}@T.GH`.toLowerCase(), password: "password1", acceptTerms: true, phone: intl, dateOfBirth: "1990-01-01",
      referralCode: referrer.referralCode.toLowerCase(),
    });
    expect(user.phone).toBe(p);
    expect(user.displayName).toBe("Ama Mensah");
    expect(user.referredById).toBe(referrer.id);
    expect(user.referralCode).not.toBe(referrer.referralCode);
    expect(user.termsVersion).toBe(TERMS_VERSION); // consent recorded with the version accepted
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
    expect((await findUserByIdentifier(p))?.id).toBe(user.id);
    expect((await findUserByIdentifier(intl))?.id).toBe(user.id);
    expect((await findUserByIdentifier(user.email.toUpperCase()))?.id).toBe(user.id);
  });

  it("rejects an unknown referral code, a duplicate phone in another format, a duplicate email, and under-18s", async () => {
    const p = phone();
    const email = `d_${unique()}@t.gh`;
    await registerUser({ email, password: "password1", acceptTerms: true, phone: p, dateOfBirth: "1990-01-01" });
    await expect(registerUser({ email: `x_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: "1990-01-01", referralCode: "NOPE0000" }))
      .rejects.toMatchObject({ code: "BAD_REFERRAL" });
    await expect(registerUser({ email: `y_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: "233" + p.slice(1), dateOfBirth: "1990-01-01" }))
      .rejects.toMatchObject({ code: "PHONE_TAKEN" });
    await expect(registerUser({ email, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: "1990-01-01" }))
      .rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    const tooYoung = new Date(); tooYoung.setFullYear(tooYoung.getFullYear() - 17);
    await expect(registerUser({ email: `z_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: tooYoung.toISOString().slice(0, 10) }))
      .rejects.toMatchObject({ code: "UNDERAGE" });
  });
});

describe("saved betslip revalidation", () => {
  it("drops unknown and closed legs, refreshes odds, keeps order", async () => {
    const a = await makeMatch({ home: 2.0, away: 4.0 });
    const b = await makeMatch({ home: 1.5, away: 3.0 });
    const started = await makeMatch({ home: 1.8, away: 2.0 }, new Date(Date.now() - 60_000));
    await prisma.selection.update({ where: { id: b.away.id }, data: { milliOdds: 3300 } });
    const r = await resolvePicks([b.away.id, "gone-after-resync", started.home.id, a.home.id]);
    expect(r.picks.map((p) => p.selectionId)).toEqual([b.away.id, a.home.id]);
    expect(r.picks[0]!.milliOdds).toBe(3300);
    expect(r.unavailable).toBe(2);
  });
});

describe("singles, start-time filter and results", () => {
  it("places singles as independent bets that settle on their own", async () => {
    const user = await fundedUser(100);
    const a = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const b = await makeMatch({ home: 1.5, draw: 3.0, away: 5.0 });
    for (const sel of [a.home, b.away])
      await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: sel.id, expectedMilliOdds: sel.milliOdds }] });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(80)); // 2 x 10 staked
    await settleFixture(a.fixture.id, 1, 0); // a.home wins 20
    await settleFixture(b.fixture.id, 1, 0); // b.away loses
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(100));
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("filters by start time and lists finished matches with scores", async () => {
    const soon = await makeMatch({ home: 2, draw: 3, away: 4 }, new Date(Date.now() + 30 * 60_000));
    const later = await makeMatch({ home: 2, draw: 3, away: 4 }, new Date(Date.now() + 5 * 3600_000));
    const within1h = (await listFixtures({ withinHours: 1, take: 500 })).map((f) => f.id);
    expect(within1h).toContain(soon.fixture.id);
    expect(within1h).not.toContain(later.fixture.id);

    const done = await makeMatch({ home: 2, draw: 3, away: 4 }, new Date(Date.now() - 3 * 3600_000));
    await settleFixture(done.fixture.id, 3, 1);
    const result = (await listResults()).find((f) => f.id === done.fixture.id);
    expect(result).toMatchObject({ homeScore: 3, awayScore: 1, status: "FINISHED" });
    expect((await listResults()).map((f) => f.id)).not.toContain(later.fixture.id);
  });
});

describe("admin: manual games, void and final results", () => {
  const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();

  it("creates a manual game with its markets, takes a bet on it and settles it", async () => {
    const input = manualFixtureSchema.parse({
      sportKey: "football",
      competition: "Test Friendlies",
      homeTeam: "Accra City",
      awayTeam: "Kumasi United",
      startsAt: inAnHour(),
      result: { home: 2.1, draw: 3.2, away: 3.4 },
      total: { line: 2.5, over: 1.9, under: 1.9 },
      btts: { yes: 1.8, no: 2.0 },
    });
    const { id } = await createManualFixture(input);
    const f = await prisma.fixture.findUniqueOrThrow({ where: { id }, include: { markets: { include: { selections: true } } } });
    expect(f.providerRef).toBeNull(); // the feed never touches it
    expect(f.markets.map((m) => m.type).sort()).toEqual(["BTTS", "MATCH_RESULT", "OVER_UNDER"]);
    const home = f.markets.find((m) => m.type === "MATCH_RESULT")!.selections.find((x) => x.code === "1")!;
    expect(home.milliOdds).toBe(2100);

    const user = await fundedUser(100);
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2100 }] });
    await settleFixture(id, 2, 1);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(111)); // 90 + 21
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("generates a fictional game, goes live at kick-off, takes live scores without paying, then settles", async () => {
    const input = manualFixtureSchema.parse(generateMatch("football"));
    const { id } = await createManualFixture(input);

    // Shows on the site and takes bets while upcoming.
    expect((await listFixtures({ take: 500 })).find((f) => f.id === id)?.bettable).toBe(true);
    const user = await fundedUser(100);
    const home = await prisma.selection.findFirstOrThrow({ where: { market: { fixtureId: id, type: "MATCH_RESULT" }, code: "1" } });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: true, selections: [{ selectionId: home.id, expectedMilliOdds: home.milliOdds }] });

    // No live score before it kicks off.
    await expect(setLiveScore(id, 1, 0)).rejects.toMatchObject({ code: "NOT_STARTED" });

    // Admin moves kick-off to now; the worker step flips it LIVE like a feed game (feed games untouched).
    const feed = await makeMatch({ home: 2, draw: 3, away: 4 }, new Date(Date.now() - 60_000));
    expect(await rescheduleManualFixture(id, new Date(Date.now() - 60_000).toISOString())).toBe(true);
    expect(await rescheduleManualFixture(feed.fixture.id, new Date().toISOString())).toBe(false); // not a manual game
    expect((await goLiveManualFixtures()).live).toBeGreaterThanOrEqual(1);
    expect((await prisma.fixture.findUniqueOrThrow({ where: { id } })).status).toBe("LIVE");
    expect((await prisma.fixture.findUniqueOrThrow({ where: { id: feed.fixture.id } })).status).toBe("SCHEDULED"); // feed flip is the feed's job

    // Live score shows but pays nothing yet.
    await setLiveScore(id, 1, 0);
    await setLiveScore(id, 2, 0);
    const mid = await prisma.fixture.findUniqueOrThrow({ where: { id } });
    expect([mid.homeScore, mid.awayScore, mid.status]).toEqual([2, 0, "LIVE"]);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90)); // staked, not paid

    // Final whistle: admin settles, the home win pays out.
    await settleFixture(id, 2, 0);
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    expect(bet.status).toBe("WON");
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90) + bet.potentialPayout);
    await expect(setLiveScore(id, 3, 0)).rejects.toMatchObject({ code: "ALREADY_SETTLED" }); // no live edits after a result
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("plays a generated match out live from its script and settles it on the final whistle", async () => {
    const input = manualFixtureSchema.parse(generateMatch("football"));
    const script = buildScript("football", [1, 0], [2, 1]); // home wins, leading at the break
    const { id } = await createManualFixture(input, script);

    // Bet on the home win while it is still upcoming.
    const user = await fundedUser(100);
    const home = await prisma.selection.findFirstOrThrow({ where: { market: { fixtureId: id, type: "MATCH_RESULT" }, code: "1" } });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: true, selections: [{ selectionId: home.id, expectedMilliOdds: home.milliOdds }] });

    const kickOff = new Date();
    await rescheduleManualFixture(id, kickOff.toISOString());
    const at = (min: number) => new Date(kickOff.getTime() + min * 60_000);
    const read = () => prisma.fixture.findUniqueOrThrow({ where: { id } });

    // Kick-off: live at 0-0, nothing paid.
    await advanceScriptedMatches(at(0));
    expect(await read()).toMatchObject({ status: "LIVE", homeScore: 0, awayScore: 0 });

    // Half time: exactly the scripted half-time score, still unsettled.
    await advanceScriptedMatches(at(script.halfMin));
    expect(await read()).toMatchObject({ status: "LIVE", homeScore: 1, awayScore: 0 });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90)); // staked, not paid

    // Full time: the script settles it and the home win pays out, once.
    expect(await advanceScriptedMatches(at(scriptLengthMin(script)))).toMatchObject({ settled: 1 });
    expect(await read()).toMatchObject({ status: "FINISHED", homeScore: 2, awayScore: 1 });
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    expect(bet.status).toBe("WON");
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90) + bet.potentialPayout);

    // A later tick finds nothing to do: no second payout.
    expect(await advanceScriptedMatches(at(scriptLengthMin(script) + 30))).toEqual({ updated: 0, settled: 0 });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90) + bet.potentialPayout);
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("leaves hand-entered and feed games alone: only generated ones carry a script", async () => {
    const plain = await createManualFixture(manualFixtureSchema.parse(generateMatch("football"))); // no script
    await rescheduleManualFixture(plain.id, new Date(Date.now() - 60_000).toISOString());
    const feed = await makeMatch({ home: 2, draw: 3, away: 4 }, new Date(Date.now() - 60_000));
    expect(await advanceScriptedMatches()).toEqual({ updated: 0, settled: 0 });
    expect((await prisma.fixture.findUniqueOrThrow({ where: { id: plain.id } })).homeScore).toBeNull();
    expect((await prisma.fixture.findUniqueOrThrow({ where: { id: feed.fixture.id } })).homeScore).toBeNull();
  });

  it("rejects bad manual games: same teams, missing draw odds, past kick-off, quarter lines", () => {
    const base = { sportKey: "football", competition: "Test", homeTeam: "A FC", awayTeam: "B FC", startsAt: inAnHour(), result: { home: 2, draw: 3, away: 4 } };
    expect(manualFixtureSchema.safeParse({ ...base, awayTeam: "a fc" }).success).toBe(false);
    expect(manualFixtureSchema.safeParse({ ...base, result: { home: 2, away: 4 } }).success).toBe(false);
    expect(manualFixtureSchema.safeParse({ ...base, startsAt: new Date(Date.now() - 60_000).toISOString() }).success).toBe(false);
    expect(manualFixtureSchema.safeParse({ ...base, total: { line: 2.75, over: 1.9, under: 1.9 } }).success).toBe(false);
    expect(manualFixtureSchema.safeParse({ ...base, result: { home: 1, draw: 3, away: 4 } }).success).toBe(false);
    expect(manualFixtureSchema.safeParse(base).success).toBe(true);
  });

  it("voids a match: singles refunded, the leg counts 1.00 in a multiple", async () => {
    const user = await fundedUser(100);
    const voided = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const other = await makeMatch({ home: 1.5, draw: 3.0, away: 5.0 });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: voided.home.id, expectedMilliOdds: 2000 }] });
    const acca = await placeBet(user.id, {
      idempotencyKey: randomUUID(),
      stakeGhs: 10,
      acceptOddsChange: false,
      selections: [
        { selectionId: voided.away.id, expectedMilliOdds: 4000 },
        { selectionId: other.home.id, expectedMilliOdds: 1500 },
      ],
    });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(80));
    await voidFixture(voided.fixture.id);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90)); // single refunded; multiple still open
    await settleFixture(other.fixture.id, 1, 0); // other leg wins
    const settled = await prisma.bet.findFirstOrThrow({ where: { ref: acca.ref } });
    expect(settled.status).toBe("WON");
    expect(settled.potentialPayout).toBe(toPesewas(15)); // 10 x 1.50 (void leg at 1.00)
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(105));
    expect((await prisma.fixture.findUniqueOrThrow({ where: { id: voided.fixture.id } })).status).toBe("CANCELLED");
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("refuses to settle or void a match twice", async () => {
    const user = await fundedUser(100);
    const m = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: m.home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(m.fixture.id, 1, 0);
    await expect(settleFixture(m.fixture.id, 0, 3)).rejects.toBeInstanceOf(SettlementError);
    await expect(voidFixture(m.fixture.id)).rejects.toBeInstanceOf(SettlementError);
    const f = await prisma.fixture.findUniqueOrThrow({ where: { id: m.fixture.id } });
    expect([f.homeScore, f.awayScore]).toEqual([1, 0]); // first result stands
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(110)); // paid once
  });
});

describe("winning pop-up", () => {
  it("lists a fresh win once with the amount paid, never a loss, and only the owner can dismiss it", async () => {
    const user = await fundedUser(100);
    const other = await fundedUser(0);
    const won = await makeMatch({ home: 2.5, draw: 3.0, away: 3.0 });
    const lost = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const w = await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: won.home.id, expectedMilliOdds: 2500 }] });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: lost.home.id, expectedMilliOdds: 2000 }] });
    expect(await unseenWins(user.id)).toEqual([]); // nothing settled yet

    await settleFixture(won.fixture.id, 1, 0);
    await settleFixture(lost.fixture.id, 0, 1);
    const wins = await unseenWins(user.id);
    expect(wins.map((x) => [x.ref, x.payout])).toEqual([[w.ref, toPesewas(25)]]);
    const row = await prisma.bet.findUniqueOrThrow({ where: { ref: w.ref } });
    expect(wins[0]!.verifyCode).toBe(row.verifyCode);
    // Ranking comes from real wins only: hidden below 20 recent wins, else the share this one beat.
    const recent = { status: "WON" as const, settledAt: { gte: new Date(Date.now() - 30 * 86_400_000) } };
    const sample = await prisma.bet.count({ where: recent });
    const below = await prisma.bet.count({ where: { ...recent, potentialPayout: { lt: row.potentialPayout } } });
    expect(wins[0]!.beatPct).toBe(sample < 20 ? null : Math.floor((below * 100) / sample));

    expect(await markWinsSeen(other.id, [wins[0]!.id])).toBe(0); // not theirs
    expect(await unseenWins(user.id)).toHaveLength(1);
    expect(await markWinsSeen(user.id, [wins[0]!.id])).toBe(1);
    expect(await unseenWins(user.id)).toEqual([]); // shown once only
  });

  it("skips wins settled more than a week ago", async () => {
    const user = await fundedUser(100);
    const m = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const b = await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: m.home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(m.fixture.id, 1, 0);
    await prisma.bet.update({ where: { ref: b.ref }, data: { settledAt: new Date(Date.now() - 8 * 86_400_000) } });
    expect(await unseenWins(user.id)).toEqual([]);
  });
});

describe("multiples settle on the first lost leg", () => {
  it("settles a multiple as LOST as soon as one leg loses, even with other games still to play", async () => {
    const user = await fundedUser(100);
    const early = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const later = await makeMatch({ home: 1.5, draw: 3.0, away: 5.0 });
    const acca = await placeBet(user.id, {
      idempotencyKey: randomUUID(),
      stakeGhs: 10,
      acceptOddsChange: false,
      selections: [
        { selectionId: early.home.id, expectedMilliOdds: 2000 },
        { selectionId: later.home.id, expectedMilliOdds: 1500 },
      ],
    });
    await settleFixture(early.fixture.id, 0, 1); // first leg loses
    const bet = await prisma.bet.findFirstOrThrow({ where: { ref: acca.ref }, include: { selections: true } });
    expect(bet.status).toBe("LOST");
    expect(bet.settledAt).not.toBeNull();
    expect(bet.selections.map((s) => s.status).sort()).toEqual(["LOST", "OPEN"]); // the other game hasn't been played
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90));

    await settleFixture(later.fixture.id, 2, 0); // the other leg would have won: no payout, no double settlement
    const after = await prisma.bet.findFirstOrThrow({ where: { ref: acca.ref }, include: { selections: true } });
    expect(after.status).toBe("LOST");
    expect(after.selections.map((s) => s.status).sort()).toEqual(["LOST", "WON"]);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(90));
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("keeps a multiple open while every graded leg has won", async () => {
    const user = await fundedUser(100);
    const a = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const b = await makeMatch({ home: 1.5, draw: 3.0, away: 5.0 });
    const acca = await placeBet(user.id, {
      idempotencyKey: randomUUID(),
      stakeGhs: 10,
      acceptOddsChange: false,
      selections: [
        { selectionId: a.home.id, expectedMilliOdds: 2000 },
        { selectionId: b.home.id, expectedMilliOdds: 1500 },
      ],
    });
    await settleFixture(a.fixture.id, 1, 0);
    expect((await prisma.bet.findFirstOrThrow({ where: { ref: acca.ref } })).status).toBe("PENDING");
    await settleFixture(b.fixture.id, 1, 0);
    const won = await prisma.bet.findFirstOrThrow({ where: { ref: acca.ref } });
    expect(won.status).toBe("WON");
    expect(won.potentialPayout).toBe(toPesewas(30)); // 10 x 2.00 x 1.50
  });
});

describe("new markets settle through the ledger", () => {
  it("pays correct score, team total and extra over/under lines; a whole-line push refunds", async () => {
    const user = await fundedUser(100);
    const { fixture } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const market = async (type: "CORRECT_SCORE" | "HOME_TOTAL" | "ALT_TOTAL", line: number | null, code: string, odds: number) => {
      const m = await prisma.market.create({ data: { fixtureId: fixture.id, type, name: type, line, status: "OPEN" } });
      return prisma.selection.create({ data: { marketId: m.id, code, name: code, milliOdds: Math.round(odds * 1000), status: "OPEN" } });
    };
    const cs = await market("CORRECT_SCORE", null, "2-1", 9);
    const ht = await market("HOME_TOTAL", 1.5, "OVER", 2.5);
    const push = await market("ALT_TOTAL", 3, "OVER", 2.2);
    for (const sel of [cs, ht, push])
      await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: sel.id, expectedMilliOdds: sel.milliOdds }] });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(70));

    await settleFixture(fixture.id, 2, 1); // 3 goals: correct score wins, home over 1.5 wins, over 3 pushes
    // 70 + 90 (10 x 9) + 25 (10 x 2.5) + 10 (push refund) = 195
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(195));
    const statuses = (await prisma.bet.findMany({ where: { userId: user.id }, orderBy: { placedAt: "asc" } })).map((b) => b.status);
    expect(statuses).toEqual(["WON", "WON", "VOID"]);
    expect(await ledgerIsBalanced()).toBe(true);
  });
});

describe("feed refresh retires picks it stopped quoting", () => {
  it("suspends a dropped pick (no bets on it), and reopens it when the feed quotes it again", async () => {
    const { fixture } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const cs = (codes: string[]) => [{ type: "CORRECT_SCORE" as const, name: "Correct Score", selections: codes.map((c, i) => ({ code: c, name: c, milliOdds: 9000 + i * 1000 })) }];
    await applyMarkets(fixture.id, cs(["1-0", "5-0"]), ["CORRECT_SCORE"]);
    await applyMarkets(fixture.id, cs(["1-0", "OTHER"]), ["CORRECT_SCORE"]); // the feed dropped 5-0
    const status = async (code: string) => (await prisma.selection.findFirstOrThrow({ where: { code, market: { fixtureId: fixture.id, type: "CORRECT_SCORE" } } })).status;
    expect(await status("5-0")).toBe("SUSPENDED");
    expect(await status("OTHER")).toBe("OPEN");

    const user = await fundedUser(50);
    const dropped = await prisma.selection.findFirstOrThrow({ where: { code: "5-0", market: { fixtureId: fixture.id } } });
    await expect(
      placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 5, acceptOddsChange: true, selections: [{ selectionId: dropped.id, expectedMilliOdds: dropped.milliOdds }] }),
    ).rejects.toBeInstanceOf(BetError);

    await applyMarkets(fixture.id, cs(["1-0", "5-0", "OTHER"]), ["CORRECT_SCORE"]);
    expect(await status("5-0")).toBe("OPEN");
  });
});

describe("live scores", () => {
  it("settles a match that finished and dropped out of the in-play feed", async () => {
    const user = await fundedUser(100);
    const { fixture, home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await placeBet(user.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: home.id, expectedMilliOdds: 2000 }] });
    const comp = await prisma.competition.create({ data: { sportKey: "football", name: `Live League ${randomUUID()}`, providerRef: "soccer_test" } });
    // Kicked off 2.5 hours ago and still marked live.
    await prisma.fixture.update({ where: { id: fixture.id }, data: { competitionId: comp.id, status: "LIVE", startsAt: new Date(Date.now() - 150 * 60_000) } });

    const result = { providerRef: fixture.providerRef!, homeScore: 2, awayScore: 1, finished: true };
    feed.override = {
      fetchLiveScores: async () => [], // over, so no longer in play
      fetchResults: async (refs: string[]) => (refs.includes(result.providerRef) ? [result] : []),
      creditsRemaining: null,
    } as unknown as OddsProvider;
    try {
      expect(await updateLiveScores()).toMatchObject({ settled: 1 });
    } finally {
      feed.override = null;
    }
    expect(await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } })).toMatchObject({ status: "FINISHED", homeScore: 2, awayScore: 1 });
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(110)); // home win paid
    expect(await ledgerIsBalanced()).toBe(true);
  });
});

describe("pages refresh when match data changes", () => {
  it("changes the data fingerprint on a live score update and on a price change", async () => {
    const { fixture, home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const v0 = await dataVersion();
    await new Promise((r) => setTimeout(r, 5)); // timestamps are millisecond precision
    await prisma.fixture.updateMany({ where: { id: fixture.id }, data: { homeScore: 1, awayScore: 0, status: "LIVE" } }); // as updateLiveScores does
    const v1 = await dataVersion();
    expect(v1).not.toBe(v0);
    await new Promise((r) => setTimeout(r, 5));
    await prisma.selection.update({ where: { id: home.id }, data: { milliOdds: 2100 } });
    expect(await dataVersion()).not.toBe(v1);
    expect(await dataVersion()).toBe(await dataVersion()); // stable when nothing changes
  });
});

describe("ticket verification codes", () => {
  const place = async (userId: string, selectionId: string) =>
    placeBet(userId, { idempotencyKey: randomUUID(), stakeGhs: 5, acceptOddsChange: false, selections: [{ selectionId, expectedMilliOdds: 2000 }] });

  it("gives every new bet a unique, unguessable code that verifies only once settled, however it is typed", async () => {
    const user = await fundedUser(100);
    const { fixture, home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const [a, b] = [await place(user.id, home.id), await place(user.id, home.id)];
    const rows = await prisma.bet.findMany({ where: { ref: { in: [a.ref, b.ref] } }, select: { ref: true, verifyCode: true } });
    for (const r of rows) expect(r.verifyCode).toMatch(/^KB[ACDEFGHJKLMNPQRSTUVWXYZ2345679]{14}$/);
    expect(rows[0]!.verifyCode).not.toBe(rows[1]!.verifyCode);

    const code = rows[0]!.verifyCode!;
    const typed = `${code.slice(0, 6).toLowerCase()} - ${code.slice(6)}`; // case, spaces and dashes don't matter
    expect(await ticketByVerifyCode(code)).toBeNull(); // still running: nothing to verify yet
    await settleFixture(fixture.id, 1, 0);
    expect((await ticketByVerifyCode(typed))?.ref).toBe(rows[0]!.ref);
    expect(await ticketByVerifyCode("KBNOTAREALCODE00")).toBeNull();
    expect(await ticketByVerifyCode("   ")).toBeNull();
  });

  it("assigns a code once to an older bet that has none", async () => {
    const user = await fundedUser(100);
    const { home } = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const placed = await place(user.id, home.id);
    const bet = await prisma.bet.update({ where: { ref: placed.ref }, data: { verifyCode: null } });
    const [first, again] = await Promise.all([ensureVerifyCode(bet), ensureVerifyCode(bet)]); // concurrent opens agree
    expect(first).toBe(again);
    expect(await ensureVerifyCode({ id: bet.id, verifyCode: first })).toBe(first);
    expect((await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } })).verifyCode).toBe(first);
  });
});

describe("cash out", () => {
  const single = async (stakeGhs: number, odds = 2.0) => {
    const user = await fundedUser(1000);
    const m = await makeMatch({ home: odds, draw: 3.0, away: 4.0 });
    const placed = await placeBet(user.id, {
      idempotencyKey: randomUUID(),
      stakeGhs,
      acceptOddsChange: false,
      selections: [{ selectionId: m.home.id, expectedMilliOdds: Math.round(odds * 1000) }],
    });
    const bet = await prisma.bet.findUniqueOrThrow({ where: { ref: placed.ref } });
    return { user, bet, ...m };
  };
  const offerOf = async (betId: string) => {
    const q = await quoteForBet(betId);
    if (!q.available) throw new Error(q.reason);
    return q.offer;
  };

  it("full cash out pays the offer once, settles the bet, and later results change nothing", async () => {
    const { user, bet, fixture, home } = await single(100);
    await prisma.selection.update({ where: { id: home.id }, data: { milliOdds: 1250 } }); // now more likely
    const offer = await offerOf(bet.id);
    expect(offer).toBe(15200n); // 200 / 1.25 x 0.95
    const key = randomUUID();
    await cashOut({ betId: bet.id, userId: user.id, expected: offer, idempotencyKey: key });
    await cashOut({ betId: bet.id, userId: user.id, expected: offer, idempotencyKey: key }); // retried tap
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(900) + offer); // paid once
    expect(await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } })).toMatchObject({ status: "WON", potentialPayout: 0n }); // settled as a win
    expect((await unseenWins(user.id)).map((w) => [w.ref, w.payout])).toEqual([[bet.ref, offer]]); // trophy shows the cash out
    await expect(cashOut({ betId: bet.id, userId: user.id, expected: offer, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "UNAVAILABLE" });

    await settleFixture(fixture.id, 2, 0); // home won anyway: no extra payout
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(900) + offer);
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("refuses a stale offer and returns the new one", async () => {
    const { user, bet, home } = await single(100);
    const seen = await offerOf(bet.id);
    await prisma.selection.update({ where: { id: home.id }, data: { milliOdds: 2500 } });
    await expect(cashOut({ betId: bet.id, userId: user.id, expected: seen, idempotencyKey: randomUUID() })).rejects.toMatchObject({
      code: "OFFER_CHANGED",
      data: { offer: (await offerOf(bet.id)).toString() },
    });
  });

  it("partial cash out pays part now; the rest wins on the remaining stake only", async () => {
    const { user, bet, fixture } = await single(100); // payout 200, offer 95
    const offer = await offerOf(bet.id);
    expect(offer).toBe(9500n);
    await cashOut({ betId: bet.id, userId: user.id, expected: offer, amount: 4750n, idempotencyKey: randomUUID() }); // half
    const after = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } });
    expect(after.status).toBe("PENDING");
    expect(after.stake).toBe(5000n); // GHS 50 still running
    expect(after.potentialPayout).toBe(10000n);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(900) + 4750n);

    await settleFixture(fixture.id, 1, 0);
    expect(await userCashBalance(prisma, user.id)).toBe(toPesewas(900) + 4750n + 10000n); // 47.50 + 100 on the rest
    const t = await ticketByRef(bet.ref);
    expect(ticketTotals(t!)).toMatchObject({ placedStake: 10000n, cashed: 4750n, ret: 14750n });
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("enforces the GHS 1 minimums and the partial cash out limit", async () => {
    const { user, bet } = await single(100);
    const offer = await offerOf(bet.id);
    const part = (amount: bigint) => cashOut({ betId: bet.id, userId: user.id, expected: offer, amount, idempotencyKey: randomUUID() });
    await expect(part(99n)).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    await expect(part(offer - 50n)).rejects.toMatchObject({ code: "BAD_AMOUNT" }); // would leave under GHS 1
    await expect(part(offer + 1n)).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    for (let i = 0; i < 10; i++) await cashOut({ betId: bet.id, userId: user.id, expected: await offerOf(bet.id), amount: 100n, idempotencyKey: randomUUID() });
    await expect(
      cashOut({ betId: bet.id, userId: user.id, expected: await offerOf(bet.id), amount: 100n, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "PARTIAL_LIMIT" });
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("is not available once the match has started, or to another player", async () => {
    const { user, bet, fixture } = await single(100);
    const offer = await offerOf(bet.id);
    const stranger = await fundedUser(0);
    await expect(cashOut({ betId: bet.id, userId: stranger.id, expected: offer, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.fixture.update({ where: { id: fixture.id }, data: { startsAt: new Date(Date.now() - 60_000) } });
    await expect(cashOut({ betId: bet.id, userId: user.id, expected: offer, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("CONCURRENCY: a cash out racing settlement pays exactly once", async () => {
    for (let round = 0; round < 5; round++) {
      const { user, bet } = await single(100);
      const offer = await offerOf(bet.id);
      // The leg has just been graded won (as settleFixture does) while a cash out quoted earlier arrives.
      await prisma.betSelection.updateMany({ where: { betId: bet.id }, data: { status: "WON" } });
      await Promise.allSettled([settleBet(bet.id), cashOut({ betId: bet.id, userId: user.id, expected: offer, idempotencyKey: randomUUID() })]);
      const final = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id }, include: { cashouts: true } });
      const cash = await userCashBalance(prisma, user.id);
      expect(final.status).toBe("WON"); // either way it is a win
      if (final.cashouts.length === 0) expect(cash).toBe(toPesewas(900) + 20000n); // settlement paid
      else {
        expect(final.potentialPayout).toBe(0n); // cash out paid; settlement adds nothing
        expect(cash).toBe(toPesewas(900) + final.cashouts[0]!.amount);
      }
      expect(await ledgerIsBalanced()).toBe(true);
    }
  });

  it("auto cash out fires when the offer reaches the target, and only once", async () => {
    const { user, bet, home } = await single(100);
    const offer = await offerOf(bet.id); // 95.00
    await expect(setAutoCashout(user.id, bet.id, offer)).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    await expect(setAutoCashout(user.id, bet.id, 30000n)).rejects.toMatchObject({ code: "BAD_AMOUNT" }); // above the potential win
    expect(await setAutoCashout(user.id, bet.id, 15000n)).toMatchObject({ above: true });
    await runAutoCashouts();
    expect((await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } })).status).toBe("PENDING"); // not reached yet
    await prisma.selection.update({ where: { id: home.id }, data: { milliOdds: 1250 } }); // offer -> 152.00
    await runAutoCashouts();
    await runAutoCashouts();
    const final = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id }, include: { cashouts: true } });
    expect(final.status).toBe("WON");
    expect(final.cashouts).toHaveLength(1);
    expect(final.cashouts[0]).toMatchObject({ amount: 15200n, auto: true, full: true });
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("a stop-loss auto cash out fires when the offer falls to the target; a manual cash out clears the rule", async () => {
    const a = await single(100);
    expect(await setAutoCashout(a.user.id, a.bet.id, 6000n)).toMatchObject({ above: false });
    await prisma.selection.update({ where: { id: a.home.id }, data: { milliOdds: 4000 } }); // offer -> 47.50
    await runAutoCashouts();
    expect((await prisma.bet.findUniqueOrThrow({ where: { id: a.bet.id } })).status).toBe("WON");

    const b = await single(100);
    await setAutoCashout(b.user.id, b.bet.id, 15000n);
    await cashOut({ betId: b.bet.id, userId: b.user.id, expected: await offerOf(b.bet.id), amount: 1000n, idempotencyKey: randomUUID() });
    expect((await prisma.bet.findUniqueOrThrow({ where: { id: b.bet.id } })).autoCashoutTarget).toBeNull();
  });
});

describe("responsible gambling on deposits", () => {
  const deposit = (userId: string, ghs: number) => initiateDeposit(userId, ghs, "0241234567", randomUUID());

  it("enforces the daily deposit limit, counting pending deposits but not failed ones", async () => {
    const user = await fundedUser(0);
    await prisma.user.update({ where: { id: user.id }, data: { dailyDepositLimit: toPesewas(100) } });
    const first = await deposit(user.id, 60); // pending
    await expect(deposit(user.id, 50)).rejects.toMatchObject({ code: "DEPOSIT_LIMIT" }); // 60 + 50 > 100
    await processPaymentEvent("sandbox", { providerEventId: `evt_${randomUUID()}`, ourRef: first.ref, status: "FAILED", amountPesewas: first.amount });
    await expect(deposit(user.id, 100)).resolves.toMatchObject({ status: "PENDING" }); // the failed 60 no longer counts
    await expect(deposit(user.id, 1)).rejects.toMatchObject({ code: "DEPOSIT_LIMIT" });
  });

  it("blocks deposits and verification payments while self-excluded", async () => {
    const user = await fundedUser(0);
    await prisma.user.update({ where: { id: user.id }, data: { selfExcludedUntil: new Date(Date.now() + 86_400_000) } });
    await expect(deposit(user.id, 50)).rejects.toMatchObject({ code: "SELF_EXCLUDED" });
    await prisma.bet.create({
      data: { ref: `KB-T${Date.now()}`, userId: user.id, type: "SINGLE", stake: 1n, combinedMilliOdds: 2000000, potentialPayout: toPesewas(2000), status: "WON", idempotencyKey: randomUUID() },
    }); // a big win, so verification applies
    await expect(initiateVerificationPayment(user.id, "0241234567", randomUUID())).rejects.toMatchObject({ code: "SELF_EXCLUDED" });
  });
});

describe("admin system", () => {
  const uniq = () => randomUUID().slice(0, 8);
  const makeSuper = async () =>
    prisma.user.create({ data: { email: `sa_${uniq()}@t.gh`, passwordHash: "x", role: "SUPER_ADMIN", referralCode: referralCode() } });
  const newAdmin = (actor: Awaited<ReturnType<typeof makeSuper>>, over: Partial<Parameters<typeof createAdmin>[1]> = {}) =>
    createAdmin(actor, { email: `ad_${uniq()}@t.gh`, displayName: "Felix", username: `felix_${uniq()}`, role: "ADMIN", ...over });
  const register = (code: string, source?: "LINK" | "CODE") =>
    registerUser({
      email: `p_${uniq()}@t.gh`,
      password: "password1",
      phone: "05" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      dateOfBirth: "1990-01-01",
      referralCode: code,
      referralSource: source,
      acceptTerms: true,
    });

  it("creates an admin with a unique ADM code and a single-use setup link", async () => {
    const sa = await makeSuper();
    const { user, token } = await newAdmin(sa, { permGrants: ["referrals.view", "not.a.permission"] });
    expect(user.referralCode).toMatch(/^ADM[ACDEFGHJKLMNPQRSTUVWXYZ2345679]{8}$/); // ADM + 8 random: no name in it
    expect(user.referralCode).not.toMatch(/FELIX/i);
    expect(formatReferralCode(user.referralCode, true)).toMatch(/^ADM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(user.permGrants).toEqual(["referrals.view"]); // junk dropped
    await expect(consumeAccessToken(token, "a-strong-password")).resolves.toMatchObject({ userId: user.id });
    await expect(consumeAccessToken(token, "another-password1")).rejects.toMatchObject({ code: "BAD_LINK" }); // single use
    const { verifyPassword } = await import("../src/lib/auth");
    expect(verifyPassword("a-strong-password", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(true);
    await expect(newAdmin(sa, { email: user.email })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("expired and replaced links don't work", async () => {
    const sa = await makeSuper();
    const { user, token } = await newAdmin(sa);
    const reset = await issueResetLink(sa, user.id);
    await expect(consumeAccessToken(token, "a-strong-password")).rejects.toMatchObject({ code: "BAD_LINK" }); // superseded
    await prisma.accountToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(consumeAccessToken(reset, "a-strong-password")).rejects.toMatchObject({ code: "BAD_LINK" }); // expired
  });

  it("nobody edits their own access; the last active super admin can't be removed", async () => {
    const sa = await makeSuper();
    await expect(updateAdminAccess(sa, sa.id, { role: "ADMIN" })).rejects.toMatchObject({ code: "SELF_EDIT" });
    await expect(setAdminStatus(sa, sa.id, "SUSPENDED")).rejects.toMatchObject({ code: "SELF_EDIT" });
    // Make every other super admin inactive so `sa2` is the only one left, then try to remove it.
    const sa2 = await makeSuper();
    await prisma.user.updateMany({ where: { role: "SUPER_ADMIN", id: { notIn: [sa2.id] } }, data: { status: "SUSPENDED" } });
    await expect(updateAdminAccess(sa, sa2.id, { role: "ADMIN" })).rejects.toMatchObject({ code: "LAST_SUPER_ADMIN" });
    await expect(setAdminStatus(sa, sa2.id, "SUSPENDED")).rejects.toMatchObject({ code: "LAST_SUPER_ADMIN" });
    await prisma.user.update({ where: { id: sa.id }, data: { status: "ACTIVE" } });
    await expect(updateAdminAccess(sa, sa2.id, { role: "ADMIN" })).resolves.toMatchObject({ role: "ADMIN" }); // two now: allowed
  });

  it("suspending an admin signs them out everywhere and is audited with before/after", async () => {
    const sa = await makeSuper();
    const { user } = await newAdmin(sa);
    await prisma.session.create({ data: { userId: user.id, tokenHash: `h_${uniq()}`, expiresAt: new Date(Date.now() + 3600_000) } });
    await setAdminStatus(sa, user.id, "SUSPENDED");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "ADMIN_SUSPEND", targetId: user.id } });
    expect(log).toMatchObject({ actorUserId: sa.id, before: { status: "ACTIVE" }, after: { status: "SUSPENDED" } });
  });

  it("attributes sign-ups to the admin whose code or link was used, once, server-side", async () => {
    const sa = await makeSuper();
    const { user: admin } = await newAdmin(sa);
    const shown = formatReferralCode(admin.referralCode, true);
    const viaLink = await register(shown.toLowerCase(), "LINK"); // dashes and case don't matter
    const viaCode = await register(admin.referralCode);
    expect(viaLink).toMatchObject({ referredById: admin.id, referralSource: "LINK" });
    expect(viaCode).toMatchObject({ referredById: admin.id, referralSource: "CODE" });
    expect(viaLink.referredAt).toBeInstanceOf(Date);
    await expect(register("ADMNOBODYXXXX")).rejects.toMatchObject({ code: "BAD_REFERRAL" });
    // A suspended admin's code takes no new sign-ups, but players already referred stay attributed.
    await setAdminStatus(sa, admin.id, "SUSPENDED");
    await expect(register(admin.referralCode)).rejects.toMatchObject({ code: "BAD_REFERRAL" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: viaLink.id } })).referredById).toBe(admin.id);
  });

  it("scopes analytics and player access to each admin's own referrals", async () => {
    const sa = await makeSuper();
    const { user: a } = await newAdmin(sa, { permGrants: ["referrals.view"] });
    const { user: b } = await newAdmin(sa, { permGrants: ["referrals.view"] });
    const pa = await register(a.referralCode);
    const pb = await register(b.referralCode);
    const range = parseRange({ range: "all" });
    const ma = await scopeMetrics({ kind: "referrer", adminId: a.id }, range);
    const mb = await scopeMetrics({ kind: "referrer", adminId: b.id }, range);
    expect([ma.players.total, mb.players.total]).toEqual([1, 1]);
    const aStaff = { ...a, adminRole: null };
    expect(canViewPlayer(aStaff, { referredById: pa.referredById })).toBe(true);
    expect(canViewPlayer(aStaff, { referredById: pb.referredById, referredByStaff: true })).toBe(false); // B's player is off limits
    expect(canViewPlayer({ ...aStaff, permGrants: ["referrals.view", "referrals.view_all"] }, { referredById: pb.referredById, referredByStaff: true })).toBe(true);
  });

  it("reconciles GGR with the house ledger, and per-admin GGR with the bets of their players", async () => {
    const sa = await makeSuper();
    const { user: admin } = await newAdmin(sa);
    const p = await register(admin.referralCode);
    const cash = await userAccountId(prisma, p.id, "USER_CASH");
    const clearing = await houseAccountId(prisma, "PAYMENT_CLEARING");
    await postTransaction(prisma, "DEPOSIT", `seed:${p.id}`, [{ accountId: clearing, amount: -toPesewas(100) }, { accountId: cash, amount: toPesewas(100) }]);
    const m1 = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const m2 = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await placeBet(p.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: m1.home.id, expectedMilliOdds: 2000 }] });
    await placeBet(p.id, { idempotencyKey: randomUUID(), stakeGhs: 20, acceptOddsChange: false, selections: [{ selectionId: m2.home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(m1.fixture.id, 0, 1); // lost: house +10
    await settleFixture(m2.fixture.id, 1, 0); // won 40 on 20: house -20
    const range = parseRange({ range: "all" });
    const mine = await scopeMetrics({ kind: "referrer", adminId: admin.id }, range);
    expect(mine.revenue.ggr).toBe(toPesewas(-10));
    expect(mine.betting.placed).toEqual({ count: 2, stakes: toPesewas(30) });
    expect(mine.betting.won).toEqual({ count: 1, paid: toPesewas(40) });
    expect(mine.betting.lost).toEqual({ count: 1, stakes: toPesewas(10) });
    expect(mine.revenue.bySource).toEqual({ lost: toPesewas(10), won: toPesewas(-20), cashout: 0n, void: 0n });
    expect(mine.revenue.settledTurnover).toBe(toPesewas(30));
    // Global GGR is exactly the house P&L ledger, less balance corrections (reported separately).
    const all = await scopeMetrics({ kind: "all" }, range);
    const pnl = await prisma.$queryRaw<{ t: bigint }[]>`SELECT COALESCE(SUM(e.amount),0)::bigint t FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a.id = e."accountId" AND a.kind = 'HOUSE_PNL'`;
    expect(all.revenue.ggr - all.revenue.adjustments).toBe(pnl[0]!.t);
  });

  it("corrects balances only by balanced, idempotent, audited ledger adjustments", async () => {
    const sa = await makeSuper();
    const p = await fundedUser(50);
    const key = randomUUID();
    expect(await adjustBalance(sa, p.id, toPesewas(5), "Goodwill credit for outage", key)).toMatchObject({ repeated: false });
    expect(await adjustBalance(sa, p.id, toPesewas(5), "Goodwill credit for outage", key)).toMatchObject({ repeated: true }); // double submit
    expect(await userCashBalance(prisma, p.id)).toBe(toPesewas(55));
    await expect(adjustBalance(sa, p.id, toPesewas(-100), "Reverse duplicate", randomUUID())).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    await expect(adjustBalance(sa, sa.id, toPesewas(5), "Not a player", randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.auditLog.findFirst({ where: { action: "BALANCE_ADJUSTMENT", targetId: p.id } })).toMatchObject({ before: { balance: "5000" }, after: { balance: "5500" } });
    expect(await ledgerIsBalanced()).toBe(true);
  });

  it("chains the audit log and the database refuses edits and deletions", async () => {
    await audit({ actorUserId: null, action: "TEST_EVENT", metadata: { n: 1n } });
    await audit({ actorUserId: null, action: "TEST_EVENT", metadata: { n: 2 } });
    expect(await verifyAuditChain()).toMatchObject({ ok: true });
    await expect(prisma.$executeRaw`UPDATE "AuditLog" SET action = 'FORGED' WHERE action = 'TEST_EVENT'`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM "AuditLog" WHERE action = 'TEST_EVENT'`).rejects.toThrow(/append-only/);
  });
});

describe("email", () => {
  beforeAll(() => vi.stubEnv("BREVO_API_KEY", "test")); // the check only applies once email is configured
  afterAll(() => vi.unstubAllEnvs());
  const unique = () => randomUUID().slice(0, 8);
  const phone = () => "05" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const lastTo = (to: string) => [...mail.sent].reverse().find((m) => m.to === to);

  it("locks money until the emailed code is confirmed; codes are single-use", async () => {
    const user = await registerUser({ email: `v_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: "1990-01-01" });
    expect(user.emailVerifiedAt).toBeNull();
    expect(() => requireVerifiedEmail(user)).toThrow(expect.objectContaining({ code: "EMAIL_UNVERIFIED" }));
    expect(await sendVerificationCode(user)).toBe(true);
    const code = lastTo(user.email)!.subject.slice(0, 6);
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(confirmEmailCode(user.id, wrong)).rejects.toMatchObject({ code: "BAD_CODE" });
    await confirmEmailCode(user.id, code);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).toBeInstanceOf(Date);
    expect(() => requireVerifiedEmail(after)).not.toThrow();
    await expect(confirmEmailCode(user.id, code)).rejects.toMatchObject({ code: "BAD_CODE" }); // used
    // A confirmation code is never accepted as a password link.
    await expect(consumeAccessToken(`email-verify:${user.id}:${code}`, "a-strong-password")).rejects.toMatchObject({ code: "BAD_LINK" });
  });

  it("only the newest code works, and staff never need one", async () => {
    const user = await registerUser({ email: `n_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: "1990-01-01" });
    await sendVerificationCode(user);
    const first = lastTo(user.email)!.subject.slice(0, 6);
    await sendVerificationCode(user);
    const second = lastTo(user.email)!.subject.slice(0, 6);
    if (first !== second) await expect(confirmEmailCode(user.id, first)).rejects.toMatchObject({ code: "BAD_CODE" });
    await confirmEmailCode(user.id, second);
    expect(() => requireVerifiedEmail({ role: "ADMIN", emailVerifiedAt: null })).not.toThrow();
    vi.stubEnv("BREVO_API_KEY", "");
    expect(() => requireVerifiedEmail({ role: "USER", emailVerifiedAt: null })).not.toThrow(); // email not set up: nobody is locked out
    vi.stubEnv("BREVO_API_KEY", "test");
  });

  it("emails a single-use reset link that also confirms the email, and reveals nothing for unknown accounts", async () => {
    const user = await registerUser({ email: `f_${unique()}@t.gh`, password: "password1", acceptTerms: true, phone: phone(), dateOfBirth: "1990-01-01" });
    const before = mail.sent.length;
    await requestPasswordReset(`nobody_${unique()}@t.gh`);
    expect(mail.sent.length).toBe(before); // nothing sent, same answer to the caller
    await requestPasswordReset(user.phone!);
    const link = lastTo(user.email)!.text.match(/\/account\/setup\/([\w-]+)/)![1]!;
    await expect(consumeAccessToken(link, "a-new-password1")).resolves.toMatchObject({ userId: user.id, role: "USER" });
    await expect(consumeAccessToken(link, "a-new-password2")).rejects.toMatchObject({ code: "BAD_LINK" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("tells the player about a win and a deposit, after the money moves", async () => {
    const p = await fundedUser(50);
    const m = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await placeBet(p.id, { idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: m.home.id, expectedMilliOdds: 2000 }] });
    await settleFixture(m.fixture.id, 2, 0);
    await vi.waitFor(() => expect(lastTo(p.email)?.subject).toBe("You won GHS 20.00 on Kingz Bet"));
    const intent = await initiateDeposit(p.id, 30, "0241234567", randomUUID());
    await processPaymentEvent("sandbox", { providerEventId: `evt_${randomUUID()}`, ourRef: intent.ref, status: "SUCCEEDED", amountPesewas: intent.amount });
    await vi.waitFor(() => expect(lastTo(p.email)?.subject).toBe("Deposit received: GHS 30.00"));
  });
});

describe("clearing demo data", () => {
  it("keeps real money and real players, and removes the demo side without unbalancing the books", async () => {
    // A real deposit, exactly as the live provider records one.
    const real = await prisma.user.create({ data: { email: `real_${randomUUID()}@t.gh`, passwordHash: "x", referralCode: referralCode() } });
    const ref = `DEP-${randomUUID().slice(0, 8)}`;
    await prisma.paymentIntent.create({
      data: { ref, userId: real.id, direction: "DEPOSIT", amount: toPesewas(20), status: "SUCCEEDED", provider: "shinobipay", idempotencyKey: randomUUID() },
    });
    const cash = await userAccountId(prisma, real.id, "USER_CASH");
    const clearing = await houseAccountId(prisma, "PAYMENT_CLEARING");
    await postTransaction(prisma, "DEPOSIT", `deposit:${ref}`, [{ accountId: clearing, amount: -toPesewas(20) }, { accountId: cash, amount: toPesewas(20) }]);

    // A generated game with a real bet and a demo bet on it, and one with only a demo bet.
    const m = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    const demoOnly = await makeMatch({ home: 2.0, draw: 3.0, away: 4.0 });
    await prisma.fixture.updateMany({ where: { id: { in: [m.fixture.id, demoOnly.fixture.id] } }, data: { providerRef: null } });
    const pick = (s: { id: string }) => ({ idempotencyKey: randomUUID(), stakeGhs: 10, acceptOddsChange: false, selections: [{ selectionId: s.id, expectedMilliOdds: 2000 }] });
    const realBet = await placeBet(real.id, pick(m.home));

    // A demo player funded with sandbox money, who places bets.
    const demo = await fundedUser(100);
    await placeBet(demo.id, pick(m.home));
    await placeBet(demo.id, pick(demoOnly.home));
    // Somebody who signed up for real and never deposited must survive the cleanup.
    const keeper = await prisma.user.create({ data: { email: `keeper_${randomUUID()}@gmail.com`, passwordHash: "x", referralCode: referralCode() } });
    // A real sign-up who only ever had sandbox money, and bet with it: the account stays, the fake money and bet go.
    const tryer = await prisma.user.create({ data: { email: `tryer_${randomUUID()}@gmail.com`, passwordHash: "x", referralCode: referralCode() } });
    const sbRef = `DEP-${randomUUID().slice(0, 8)}`;
    await prisma.paymentIntent.create({ data: { ref: sbRef, userId: tryer.id, direction: "DEPOSIT", amount: toPesewas(50), status: "SUCCEEDED", provider: "sandbox", idempotencyKey: randomUUID() } });
    const tryerCash = await userAccountId(prisma, tryer.id, "USER_CASH");
    await postTransaction(prisma, "DEPOSIT", `deposit:${sbRef}`, [{ accountId: clearing, amount: -toPesewas(50) }, { accountId: tryerCash, amount: toPesewas(50) }]);
    await placeBet(tryer.id, pick(m.home));
    await settleFixture(m.fixture.id, 2, 0); // everyone on it wins GHS 20
    const realStaff = (await prisma.user.findMany({ where: { role: { not: "USER" } }, select: { email: true } })).filter((u) => !isTestAccount(u.email)).length;

    const plan = await planDemoCleanup();
    expect(plan.keptPlayers.map((k) => k.email)).toContain(real.email);
    expect(plan.deleteAccounts.concat(plan.closeAccounts)).toContain(demo.email);
    expect(await prisma.user.findUnique({ where: { id: demo.id } })).not.toBeNull(); // planning changes nothing

    await runDemoCleanup();

    // The real player, their money, their winning bet and the game it stands on survive untouched.
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
    expect(await userCashBalance(prisma, real.id)).toBe(toPesewas(30)); // 20 in, 10 staked, 20 won
    expect(plan.keptPlayers.find((k) => k.email === real.email)?.balanceAfter).toBe(toPesewas(30));
    expect(await prisma.paymentIntent.findUnique({ where: { ref } })).not.toBeNull();
    expect(await prisma.bet.findMany({ where: { userId: { in: [real.id, demo.id, tryer.id] } }, select: { ref: true, status: true } })).toEqual([{ ref: realBet.ref, status: "WON" }]);
    expect(await prisma.fixture.findUnique({ where: { id: m.fixture.id } })).not.toBeNull();
    expect(await prisma.fixture.findUnique({ where: { id: demoOnly.fixture.id } })).toBeNull();

    // The real sign-up who only had fake money keeps the account at zero.
    expect((await prisma.user.findUnique({ where: { id: tryer.id } }))?.status).toBe("ACTIVE");
    expect(await userCashBalance(prisma, tryer.id)).toBe(0n);

    // The demo side is gone, and staff are never touched.
    expect(await prisma.paymentIntent.count({ where: { provider: "sandbox" } })).toBe(0);
    const demoLeft = await prisma.user.findUnique({ where: { id: demo.id } });
    expect(demoLeft === null || demoLeft.status === "CLOSED").toBe(true);

    // A real sign-up with no deposit keeps their account; real staff are untouched.
    const kept = await prisma.user.findUnique({ where: { id: keeper.id } });
    expect(kept?.status).toBe("ACTIVE");
    expect((await prisma.user.findMany({ where: { role: { not: "USER" } }, select: { email: true } })).filter((u) => !isTestAccount(u.email)).length).toBe(realStaff);

    // The books still add up, which is the check that would have rolled it all back.
    expect(await ledgerIsBalanced()).toBe(true);
    expect(await verifyAuditChain()).toMatchObject({ ok: true }); // the audit trail is untouched
  });
});
