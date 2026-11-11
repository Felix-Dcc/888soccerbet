-- New sign-ups see only the first-deposit page until a deposit succeeds. Existing players: false.
ALTER TABLE "User" ADD COLUMN "depositRequired" BOOLEAN NOT NULL DEFAULT false;
