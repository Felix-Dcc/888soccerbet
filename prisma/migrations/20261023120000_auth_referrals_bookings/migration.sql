-- Public numeric match IDs. Existing rows are renumbered into a 7-digit range and the
-- sequence continues from there (fresh databases also start at 1000001).
ALTER TABLE "Fixture" ADD COLUMN "code" SERIAL NOT NULL;
UPDATE "Fixture" SET "code" = "code" + 1000000;
SELECT setval('"Fixture_code_seq"', GREATEST(1000000, COALESCE((SELECT max("code") FROM "Fixture"), 0)));

-- Referral codes: add nullable, backfill existing users, then enforce NOT NULL.
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referredById" TEXT;
UPDATE "User" SET "referralCode" = upper(substr(md5("id" || random()::text), 1, 8)) WHERE "referralCode" IS NULL;
ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "BookingCode" (
    "code" TEXT NOT NULL,
    "selectionIds" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingCode_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "BookingCode_createdAt_idx" ON "BookingCode"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_code_key" ON "Fixture"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCode" ADD CONSTRAINT "BookingCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
