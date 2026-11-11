import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { adminInviteValid } from "@/lib/admins";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin invite — Bet Zone", robots: { index: false } };

/** An administrator invite: the new admin chooses their own email and password. */
export default async function AdminInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = token.length >= 12 && token.length <= 100 && (await adminInviteValid(token));
  return (
    <AuthShell title={valid ? "Set up your admin account" : "Invite link not valid"}>
      {valid ? (
        <InviteForm token={token} />
      ) : (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-fog">
            This invite link is invalid, has already been used, or has expired. Ask a super admin for a new one.
          </p>
          <Link href="/login" className="btn-ghost inline-flex px-4 py-2 text-sm">
            Go to sign in
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
