import { adminPage } from "@/lib/adminPage";
import { can } from "@/lib/permissions";
import { parseRange } from "@/lib/adminAnalytics";
import { Head, Icon, Range, btnGhost } from "@/components/admin/kit";
import { ReferralDashboard } from "@/components/admin/ReferralDashboard";

export const dynamic = "force-dynamic";

/** The signed-in admin's own partner desk. */
export default async function MyReferralsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const gate = await adminPage(["referrals.view"]);
  if (!gate.ok) return gate.deny;
  const sp = await searchParams;
  const range = parseRange(sp);
  return (
    <>
      <Head title="My referrals">
        <Range path="/admin/referrals" current={range.key} params={{ q: sp.q }} />
        {can(gate.user, "reports.export") && (
          <a href={`/api/admin/export?kind=players&range=${range.key}`} className={btnGhost}>
            <Icon name="download" />
            Players CSV
          </a>
        )}
      </Head>
      <ReferralDashboard admin={gate.user} range={range} playersLinkable path="/admin/referrals" q={sp.q} />
    </>
  );
}
