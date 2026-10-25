-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MarketType" ADD VALUE 'ALT_TOTAL';
ALTER TYPE "MarketType" ADD VALUE 'ALT_HANDICAP';
ALTER TYPE "MarketType" ADD VALUE 'HOME_TOTAL';
ALTER TYPE "MarketType" ADD VALUE 'AWAY_TOTAL';
ALTER TYPE "MarketType" ADD VALUE 'CORRECT_SCORE';
ALTER TYPE "MarketType" ADD VALUE 'ODD_EVEN';
