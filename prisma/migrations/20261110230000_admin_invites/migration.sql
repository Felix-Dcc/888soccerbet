-- CreateTable
CREATE TABLE "AdminInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "adminRoleId" TEXT,
    "permGrants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permDenials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvite_tokenHash_key" ON "AdminInvite"("tokenHash");

