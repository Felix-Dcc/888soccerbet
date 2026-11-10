import "server-only";
import { prisma } from "./db";
import type { PlatformSettings } from "@prisma/client";

const DEFAULTS: Omit<PlatformSettings, "id" | "updatedAt"> = {
  minWithdrawalGhs: 2000,
  minDepositGhs: 50,
  minStakeGhs: 250,
  maxStakeGhs: 5000,
  maxPayoutGhs: 200000,
  minDepositToWithdrawGhs: 0,
  minLifetimeStakeGhs: 0,
  kycVerificationFeeGhs: 500,
  nttComplianceFeeGhs: 500,
  withdrawalCapMultiplier: 10,
  telegramSupport: "",
  emailSupport: "",
  defaultCommissionBp: 0,
};

let cached: PlatformSettings | null = null;
let cachedAt = 0;
const TTL = 60_000;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (cached && Date.now() - cachedAt < TTL) return cached;
  const row = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...DEFAULTS },
    update: {},
  });
  cached = row;
  cachedAt = Date.now();
  return row;
}

export function invalidateSettingsCache() {
  cached = null;
  cachedAt = 0;
}

export type SettingsPayload = Omit<PlatformSettings, "id" | "updatedAt">;

export async function updatePlatformSettings(data: Partial<SettingsPayload>): Promise<PlatformSettings> {
  const row = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...DEFAULTS, ...data },
    update: data,
  });
  cached = row;
  cachedAt = Date.now();
  return row;
}
