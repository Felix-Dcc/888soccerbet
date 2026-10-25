/**
 * Double-entry ledger. Every money movement is a LedgerTransaction whose LedgerEntry
 * rows sum to exactly zero. Balances are derived from entries — never stored mutably —
 * so the books are always reconstructable and auditable.
 */
import type { AccountKind, Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";

type Client = Tx | typeof prisma;

// House accounts are singletons keyed by a fixed id so they can never fork.
const HOUSE_IDS: Partial<Record<AccountKind, string>> = {
  HOUSE_CASH: "acct_house_cash",
  HOUSE_PNL: "acct_house_pnl",
  PAYMENT_CLEARING: "acct_payment_clearing",
};

export async function houseAccountId(db: Client, kind: AccountKind, currency = "GHS"): Promise<string> {
  const id = HOUSE_IDS[kind];
  if (!id) throw new Error(`${kind} is not a house account`);
  await db.ledgerAccount.upsert({
    where: { id },
    create: { id, kind, currency, userId: null },
    update: {},
  });
  return id;
}

export async function userAccountId(
  db: Client,
  userId: string,
  kind: Extract<AccountKind, "USER_CASH" | "BET_ESCROW" | "BONUS" | "VERIFICATION_HOLD">,
  currency = "GHS",
): Promise<string> {
  const existing = await db.ledgerAccount.findUnique({
    where: { userId_kind_currency: { userId, kind, currency } },
  });
  if (existing) return existing.id;
  const created = await db.ledgerAccount.create({ data: { userId, kind, currency } });
  return created.id;
}

export interface Posting {
  accountId: string;
  amount: bigint; // signed pesewas
}

/**
 * Append a balanced transaction. `reference` is unique: a second call with the same
 * reference throws P2002, which callers use as an idempotency guard.
 */
export async function postTransaction(
  db: Client,
  kind: string,
  reference: string,
  postings: Posting[],
  metadata?: Prisma.InputJsonValue,
): Promise<string> {
  if (postings.length < 2) throw new Error("a transaction needs at least two entries");
  const sum = postings.reduce((t, p) => t + p.amount, 0n);
  if (sum !== 0n) throw new Error(`unbalanced transaction: entries sum to ${sum}, must be 0`);

  const txn = await db.ledgerTransaction.create({
    data: {
      kind,
      reference,
      metadata,
      entries: { create: postings.map((p) => ({ accountId: p.accountId, amount: p.amount })) },
    },
  });
  return txn.id;
}

export async function accountBalance(db: Client, accountId: string): Promise<bigint> {
  const r = await db.ledgerEntry.aggregate({ where: { accountId }, _sum: { amount: true } });
  return r._sum.amount ?? 0n;
}

/** A user's spendable cash balance (pesewas). Open stakes already live in BET_ESCROW. */
export async function userCashBalance(db: Client, userId: string, currency = "GHS"): Promise<bigint> {
  const acct = await db.ledgerAccount.findUnique({
    where: { userId_kind_currency: { userId, kind: "USER_CASH", currency } },
  });
  if (!acct) return 0n;
  return accountBalance(db, acct.id);
}

/** Whole-ledger invariant: the sum of every entry across every account is zero. */
export async function ledgerIsBalanced(db: Client = prisma): Promise<boolean> {
  const r = await db.ledgerEntry.aggregate({ _sum: { amount: true } });
  return (r._sum.amount ?? 0n) === 0n;
}
