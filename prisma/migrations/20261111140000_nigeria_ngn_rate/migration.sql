-- Naira per GHS for Nigerian players (0 = Nigeria closed)
ALTER TABLE "PlatformSettings" ADD COLUMN "ngnPerGhs" INTEGER NOT NULL DEFAULT 0;
