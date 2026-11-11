import { PrismaClient } from "@prisma/client";

/**
 * The database URL with an explicit connection pool. Postgres allows about 100 connections in all,
 * and Prisma's default pool is 2 x CPU count + 1 per process; on Railway's large hosts the web
 * server, the worker and the old web copy during a deploy together ran out ("too many clients").
 * A URL that already sets connection_limit / pool_timeout keeps its own values.
 */
export function pooledUrl(url: string | undefined, role = process.env.SERVICE_ROLE): string | undefined {
  if (!url) return url;
  const u = new URL(url);
  if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", role === "worker" ? "5" : "15");
  if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "30"); // seconds a query waits for a free connection
  return u.toString();
}

// Single Prisma client across hot reloads / serverless invocations.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const url = pooledUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Prisma's interactive-transaction client type, for functions that run inside $transaction.
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
