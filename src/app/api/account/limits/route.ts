import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { toPesewas } from "@/lib/money";
import { json, errorResponse, clientIp } from "@/lib/http";
import { z } from "zod";
import { extendSelfExclusion } from "@/lib/accounts";

export const dynamic = "force-dynamic";

const schema = z.object({
  dailyDepositLimitGhs: z.number().positive().max(1_000_000).nullable().optional(),
  maxStakeGhs: z.number().positive().max(1_000_000).nullable().optional(),
  selfExcludeDays: z.number().int().min(0).max(3650).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (input.dailyDepositLimitGhs !== undefined)
      data.dailyDepositLimit = input.dailyDepositLimitGhs === null ? null : toPesewas(input.dailyDepositLimitGhs);
    if (input.maxStakeGhs !== undefined) data.maxStakeLimit = input.maxStakeGhs === null ? null : toPesewas(input.maxStakeGhs);
    if (input.selfExcludeDays) data.selfExcludedUntil = extendSelfExclusion(user.selfExcludedUntil, input.selfExcludeDays);

    const before = { dailyDepositLimit: user.dailyDepositLimit, maxStakeLimit: user.maxStakeLimit, selfExcludedUntil: user.selfExcludedUntil };
    const after = await prisma.user.update({ where: { id: user.id }, data, select: { dailyDepositLimit: true, maxStakeLimit: true, selfExcludedUntil: true } });
    await audit({ actorUserId: user.id, action: "UPDATE_RG_LIMITS", targetType: "User", targetId: user.id, before, after, ip: clientIp(req) });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
