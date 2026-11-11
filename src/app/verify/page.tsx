import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { normaliseCode } from "@/lib/ids";
import { VerifyForm } from "@/components/VerifyForm";

export const metadata: Metadata = { title: "Verify a ticket — Bet Zone", robots: { index: false } };

/** Public ticket check: type a verification code (as printed on a shared ticket). */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const clean = code ? normaliseCode(code).slice(0, 32) : "";
  if (clean) redirect(`/verify/${encodeURIComponent(clean)}`);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Verify a ticket</h1>
      <VerifyForm />
    </div>
  );
}
