-- Admin referral codes become 8 characters: drop the "ADM" prefix (ADMW4GD7QXQ -> W4GD7QXQ).
-- Links shared with the old code keep working: sign-up retries an "ADM" + 8 code without the prefix.
-- A code whose short form is already taken (practically never) is left as it was.
UPDATE "User" u
SET "referralCode" = substring(u."referralCode" from 4)
WHERE u.role IN ('ADMIN', 'SUPER_ADMIN')
  AND u."referralCode" ~ '^ADM[A-Z0-9]{8}$'
  AND NOT EXISTS (SELECT 1 FROM "User" o WHERE o."referralCode" = substring(u."referralCode" from 4));
