import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can, isStaff } from "@/lib/permissions";
import { getPlatformSettings, updatePlatformSettings, type SettingsPayload } from "@/lib/platformSettings";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user) || !can(user, "system.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await getPlatformSettings();
  return NextResponse.json(settings);
}

const INT_FIELDS: (keyof SettingsPayload)[] = [
  "minWithdrawalGhs", "minDepositGhs", "minStakeGhs", "maxStakeGhs", "maxPayoutGhs",
  "minDepositToWithdrawGhs", "minLifetimeStakeGhs", "kycVerificationFeeGhs", "nttComplianceFeeGhs", "withdrawalCapMultiplier",
];
const STR_FIELDS: (keyof SettingsPayload)[] = ["telegramSupport", "emailSupport"];

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user) || !can(user, "system.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Partial<SettingsPayload> = {};
  for (const k of INT_FIELDS) {
    const v = body[k];
    if (v !== undefined) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: `${k} must be a non-negative number` }, { status: 400 });
      (data as Record<string, number>)[k] = Math.round(n);
    }
  }
  for (const k of STR_FIELDS) {
    if (body[k] !== undefined) (data as Record<string, string>)[k] = String(body[k]).slice(0, 500);
  }

  const settings = await updatePlatformSettings(data);
  await audit({ actorUserId: user.id, action: "system.settings_updated", metadata: { changed: Object.keys(data) } });
  return NextResponse.json(settings);
}
