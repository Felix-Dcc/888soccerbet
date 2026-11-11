import { adminPage } from "@/lib/adminPage";
import { Head, KpiCard, Panel, Grid, EmptyState, Icon, td } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  const gate = await adminPage(["reports.view"]);
  if (!gate.ok) return gate.deny;

  return (
    <>
      <Head title="Promotions & Bonuses" description="Manage active promo codes, view redemptions, and issue manual free bets." />

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          icon={<Icon name="referral" className="h-5 w-5" />}
          iconBg="bg-green-500/20 text-green-400"
          value={0}
          label="ACTIVE PROMOS"
        />
        <KpiCard
          icon={<Icon name="players" className="h-5 w-5" />}
          iconBg="bg-blue-500/20 text-blue-400"
          value={0}
          label="TOTAL REDEMPTIONS"
        />
      </div>

      {/* ── Active Promotions ── */}
      <Panel title="Active Promotions" icon="referral" flush>
        <EmptyState icon="referral" title="No promotions created yet">
          Promotions and promo codes will appear here once the promotions system is set up.
        </EmptyState>
      </Panel>
    </>
  );
}
