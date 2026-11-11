-- The seeded admin and demo logins moved from 888soccerbet.com to betzone.com.co (prisma/seed.ts).
-- Deploys never run the seed, so rename them here. Password, balance and history stay with the account.
UPDATE "User" u SET "email" = replace(u."email", '@888soccerbet.com', '@betzone.com.co')
WHERE u."email" IN ('admin@888soccerbet.com', 'demo@888soccerbet.com')
  AND NOT EXISTS (SELECT 1 FROM "User" n WHERE n."email" = replace(u."email", '@888soccerbet.com', '@betzone.com.co'));
