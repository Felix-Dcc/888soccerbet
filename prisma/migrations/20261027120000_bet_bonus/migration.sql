-- Multiple bonus paid on top of the odds payout (lib/bonus.ts). Existing bets keep 0.
ALTER TABLE "Bet" ADD COLUMN "bonusAmount" BIGINT NOT NULL DEFAULT 0;
