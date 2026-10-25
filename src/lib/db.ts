import { PrismaClient } from "@prisma/client";

// Single Prisma client across hot reloads / serverless invocations.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Prisma's interactive-transaction client type, for functions that run inside $transaction.
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
