-- In-play safety: odds fetch time and last score change per fixture.
ALTER TABLE "Fixture" ADD COLUMN "oddsAt" TIMESTAMP(3),
ADD COLUMN "scoreChangedAt" TIMESTAMP(3);
