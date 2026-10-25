-- A full cash out now settles the bet as WON. Nothing more is paid at settlement (the player
-- already received the cash out), so the settlement payout is 0.
UPDATE "Bet" SET "status" = 'WON', "potentialPayout" = 0 WHERE "status" = 'CASHED_OUT';
