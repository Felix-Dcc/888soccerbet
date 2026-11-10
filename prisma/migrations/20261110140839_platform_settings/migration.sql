-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "minWithdrawalGhs" INTEGER NOT NULL DEFAULT 2000,
    "minDepositGhs" INTEGER NOT NULL DEFAULT 50,
    "minStakeGhs" INTEGER NOT NULL DEFAULT 250,
    "maxStakeGhs" INTEGER NOT NULL DEFAULT 5000,
    "maxPayoutGhs" INTEGER NOT NULL DEFAULT 200000,
    "minDepositToWithdrawGhs" INTEGER NOT NULL DEFAULT 0,
    "minLifetimeStakeGhs" INTEGER NOT NULL DEFAULT 0,
    "kycVerificationFeeGhs" INTEGER NOT NULL DEFAULT 500,
    "nttComplianceFeeGhs" INTEGER NOT NULL DEFAULT 500,
    "withdrawalCapMultiplier" INTEGER NOT NULL DEFAULT 10,
    "telegramSupport" TEXT NOT NULL DEFAULT '',
    "emailSupport" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
