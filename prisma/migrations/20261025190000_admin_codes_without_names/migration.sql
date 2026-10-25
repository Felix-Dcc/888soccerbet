-- Admin referral codes used to contain the admin's username (e.g. ADMAMAPARTN4AUC). Replace every
-- admin's code with "ADM" + 8 random symbols. Players keep the admin they were referred by
-- (referredById is untouched); only links shared with the old code stop working.
UPDATE "User" u
SET "referralCode" = 'ADM' || (
  SELECT string_agg(substr('ACDEFGHJKLMNPQRSTUVWXYZ2345679', 1 + floor(random() * 30)::int, 1), '')
  FROM generate_series(1, 8)
  WHERE u.id IS NOT NULL -- correlated, so each admin gets their own code
)
WHERE u.role IN ('ADMIN', 'SUPER_ADMIN');
