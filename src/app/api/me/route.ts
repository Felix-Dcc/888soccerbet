import { getCurrentUser } from "@/lib/session";
import { userCashBalance } from "@/lib/ledger";
import { json, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";
import { emailVerified } from "@/lib/emailFlows";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ user: null });
    const balance = await userCashBalance(prisma, user.id);
    return json({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, kycStatus: user.kycStatus, emailVerified: emailVerified(user) },
      balance,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
