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
    const [balance, openBets] = await Promise.all([
      userCashBalance(prisma, user.id),
      prisma.bet.count({ where: { userId: user.id, status: "PENDING" } }), // the My Bets badge: same count as "Open Bets (n)"
    ]);
    return json({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, kycStatus: user.kycStatus, emailVerified: emailVerified(user) },
      balance,
      openBets,
      mustDeposit: user.depositRequired, // a new player who hasn't made a first deposit yet
    });
  } catch (e) {
    return errorResponse(e);
  }
}
