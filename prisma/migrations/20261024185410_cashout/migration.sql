-- AlterEnum
ALTER TYPE "BetStatus" ADD VALUE 'CASHED_OUT';

-- AlterTable
ALTER TABLE "Bet" ADD COLUMN     "autoCashoutAbove" BOOLEAN,
ADD COLUMN     "autoCashoutTarget" BIGINT;

-- CreateTable
CREATE TABLE "Cashout" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "stakePortion" BIGINT NOT NULL,
    "full" BOOLEAN NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cashout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cashout_idempotencyKey_key" ON "Cashout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Cashout_betId_idx" ON "Cashout"("betId");

-- CreateIndex
CREATE INDEX "Cashout_createdAt_idx" ON "Cashout"("createdAt");

-- AddForeignKey
ALTER TABLE "Cashout" ADD CONSTRAINT "Cashout_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

