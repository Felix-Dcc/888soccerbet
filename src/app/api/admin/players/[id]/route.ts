import { z } from "zod";
import { confirmPassword, requirePermission } from "@/lib/session";
import { adjustBalance, setPlayerStatus } from "@/lib/playerAdmin";
import { verifyPlayer } from "@/lib/wallet";
import { audit } from "@/lib/audit";
import { toPesewas } from "@/lib/money";
import { json, errorResponse, clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(3, "Give a reason").max(300), password: z.string() }),
  z.object({
    action: z.literal("adjust"),
    amountGhs: z.number().refine((n) => Number.isFinite(n) && n !== 0 && Math.abs(n) <= 100_000, "Enter an amount up to GHS 100,000"),
    reason: z.string().trim().min(5, "Explain the correction").max(300),
    idempotencyKey: z.string().min(8).max(100),
    password: z.string(),
  }),
  z.object({ action: z.literal("verify"), password: z.string() }),
]);

const PERMISSION = { status: "users.suspend", adjust: "wallets.adjust", verify: "verification.review" } as const;

/** Suspend/reactivate a player, correct their balance, or verify their account directly. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const input = schema.parse(await req.json());
    const actor = await requirePermission(PERMISSION[input.action]);
    confirmPassword(actor, input.password);
    const { id } = await params;
    if (input.action === "status") return json({ ok: true, status: (await setPlayerStatus(actor, id, input.status, input.reason, clientIp(req))).status });
    if (input.action === "verify") {
      const { released } = await verifyPlayer(id);
      await audit({ actorUserId: actor.id, action: "PLAYER_VERIFIED", targetType: "User", targetId: id, after: { kycStatus: "VERIFIED", released }, ip: clientIp(req) });
      return json({ ok: true, released });
    }
    return json({ ok: true, ...(await adjustBalance(actor, id, toPesewas(input.amountGhs), input.reason, input.idempotencyKey, clientIp(req))) });
  } catch (e) {
    return errorResponse(e);
  }
}
