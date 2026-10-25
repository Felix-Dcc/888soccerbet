-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "assetsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "badgeUrl" TEXT,
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "displayName" TEXT;

-- CreateTable
CREATE TABLE "TeamAsset" (
    "id" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "badgeUrl" TEXT,
    "status" TEXT NOT NULL,
    "sourceRef" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamAsset_sportKey_name_key" ON "TeamAsset"("sportKey", "name");

