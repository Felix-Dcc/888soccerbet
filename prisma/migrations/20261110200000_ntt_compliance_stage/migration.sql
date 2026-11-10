-- Add NTT compliance stage to KycStatus
ALTER TYPE "KycStatus" ADD VALUE 'KYC_APPROVED';
ALTER TYPE "KycStatus" ADD VALUE 'NTT_PENDING';
ALTER TYPE "KycStatus" ADD VALUE 'NTT_REJECTED';

-- Add NTT hold account kind
ALTER TYPE "AccountKind" ADD VALUE 'NTT_HOLD';
