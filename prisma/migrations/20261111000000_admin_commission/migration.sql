-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commissionBp" INTEGER;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "defaultCommissionBp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayout_idempotencyKey_key" ON "CommissionPayout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CommissionPayout_adminId_idx" ON "CommissionPayout"("adminId");

