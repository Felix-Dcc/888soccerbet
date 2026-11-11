-- CreateTable
CREATE TABLE "CommissionPayoutRequest" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "payoutId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionPayoutRequest_adminId_idx" ON "CommissionPayoutRequest"("adminId");

-- CreateIndex
CREATE INDEX "CommissionPayoutRequest_status_idx" ON "CommissionPayoutRequest"("status");

