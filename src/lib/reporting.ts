/** Financial reporting straight from the ledger. All figures in pesewas. */
import { prisma } from "./db";

async function sumByKind(kind: string): Promise<bigint> {
  const r = await prisma.ledgerEntry.aggregate({
    where: { transaction: { kind }, amount: { gt: 0 } },
    _sum: { amount: true },
  });
  return r._sum.amount ?? 0n;
}

async function accountKindTotal(kind: string): Promise<bigint> {
  const accts = await prisma.ledgerAccount.findMany({ where: { kind: kind as never }, select: { id: true } });
  if (!accts.length) return 0n;
  const r = await prisma.ledgerEntry.aggregate({
    where: { accountId: { in: accts.map((a) => a.id) } },
    _sum: { amount: true },
  });
  return r._sum.amount ?? 0n;
}

export interface FinancialReport {
  deposits: bigint;
  withdrawals: bigint;
  stakes: bigint;
  payouts: bigint;
  refunds: bigint;
  cashouts: bigint; // paid to players who cashed out
  grossGamingRevenue: bigint; // stakes retained by the house on settled bets
  openLiability: bigint; // stake currently held in escrow on open bets
  playerBalances: bigint; // total we owe customers
  ledgerBalanced: boolean;
  generatedAt: string;
}

export async function financialReport(): Promise<FinancialReport> {
  const [deposits, withdrawalHolds, stakes, payouts, refunds, ggr, openLiability, playerBalances, total, cashouts] =
    await Promise.all([
      sumByKind("DEPOSIT"),
      sumByKind("WITHDRAWAL_HOLD"),
      sumByKind("BET_STAKE"),
      sumByKind("BET_PAYOUT"),
      sumByKind("VOID_REFUND"),
      accountKindTotal("HOUSE_PNL"), // net house margin on settled bets == GGR
      accountKindTotal("BET_ESCROW"),
      accountKindTotal("USER_CASH"),
      prisma.ledgerEntry.aggregate({ _sum: { amount: true } }),
      prisma.cashout.aggregate({ _sum: { amount: true } }),
    ]);

  return {
    deposits,
    withdrawals: withdrawalHolds,
    stakes,
    payouts,
    refunds,
    cashouts: cashouts._sum.amount ?? 0n,
    grossGamingRevenue: ggr,
    openLiability,
    playerBalances,
    ledgerBalanced: (total._sum.amount ?? 0n) === 0n,
    generatedAt: new Date().toISOString(),
  };
}
