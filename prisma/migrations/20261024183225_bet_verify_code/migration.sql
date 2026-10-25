-- AlterTable
ALTER TABLE "Bet" ADD COLUMN "verifyCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Bet_verifyCode_key" ON "Bet"("verifyCode");
