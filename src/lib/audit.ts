/**
 * Tamper-evident audit log. Every entry records who did what to which record, with before/after
 * values, and a hash over its content plus the previous entry's hash, so editing or removing any
 * entry breaks the chain from that point (verifyAuditChain finds it). The database also refuses
 * UPDATE/DELETE on the table (see the audit_log_append_only migration).
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = Prisma.TransactionClient;

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: unknown;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** JSON-safe copy (bigint -> string); secrets must never be passed in. */
const toJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

/** Key-sorted JSON, so the hash doesn't depend on how Postgres orders JSONB keys. */
function stable(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

interface Hashable {
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: Date;
  prevHash: string | null;
}

const digest = (e: Hashable) =>
  createHash("sha256")
    .update(
      stable({
        actorUserId: e.actorUserId,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata ?? null,
        before: e.before ?? null,
        after: e.after ?? null,
        ip: e.ip,
        createdAt: e.createdAt.toISOString(),
        prevHash: e.prevHash,
      }),
    )
    .digest("hex");

/** Append one entry. Pass the transaction the action runs in, so the action and its record commit together. */
export async function audit(e: AuditEntry, db?: Db) {
  const write = async (tx: Db) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(7314159)::text`; // one writer at a time keeps the chain linear
    const last = await tx.auditLog.findFirst({ where: { hash: { not: null } }, orderBy: { seq: "desc" }, select: { hash: true } });
    const row: Hashable = {
      actorUserId: e.actorUserId,
      action: e.action,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      metadata: toJson(e.metadata) ?? null,
      before: toJson(e.before) ?? null,
      after: toJson(e.after) ?? null,
      ip: e.ip ?? null,
      createdAt: new Date(),
      prevHash: last?.hash ?? null,
    };
    return tx.auditLog.create({
      data: {
        ...row,
        metadata: toJson(e.metadata),
        before: toJson(e.before),
        after: toJson(e.after),
        hash: digest(row),
      },
    });
  };
  return db ? write(db) : prisma.$transaction(write);
}

/** Recompute the chain. Entries written before chaining existed (no hash) are skipped. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAtSeq?: number }> {
  let prev: string | null = null;
  let checked = 0;
  let cursor = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({ where: { hash: { not: null }, seq: { gt: cursor } }, orderBy: { seq: "asc" }, take: 1000 });
    if (!rows.length) return { ok: true, checked };
    for (const r of rows) {
      const expected = digest({ ...r, metadata: r.metadata, before: r.before, after: r.after });
      if (r.prevHash !== prev || r.hash !== expected) return { ok: false, checked, brokenAtSeq: r.seq };
      prev = r.hash;
      checked++;
      cursor = r.seq;
    }
  }
}
