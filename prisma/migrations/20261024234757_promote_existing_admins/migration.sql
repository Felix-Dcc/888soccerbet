-- Existing ADMIN accounts had unrestricted access; keep that by making them super admins.
-- (Separate migration: Postgres can't use a new enum value in the transaction that added it.)
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';
