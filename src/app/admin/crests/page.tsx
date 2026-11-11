import { adminPage } from "@/lib/adminPage";
import { LEAGUES } from "@/lib/crests/catalog";
import { crestUrl, leagueCrestUrl } from "@/lib/manualFixtures";
import { Crest } from "@/components/Crest";
import { Head, Panel } from "@/components/admin/kit";
import { CrestsFilter } from "./CrestsFilter";

export const dynamic = "force-dynamic";

export default async function CrestsPage() {
  const gate = await adminPage(["fixtures.manage"]);
  if (!gate.ok) return gate.deny;

  return (
    <>
      <Head title="Club Crests" description={`${LEAGUES.length} leagues, ${LEAGUES.reduce((n, l) => n + l.clubs.length, 0)} clubs — the invented teams used in generated matches.`} />
      <CrestsFilter
        leagues={LEAGUES.map((l) => ({
          name: l.name,
          code: l.code,
          region: l.region,
          badgeUrl: leagueCrestUrl(l.name),
          colors: l.colors,
          clubs: l.clubs.map((c) => ({
            name: c.name,
            town: c.town,
            founded: c.founded,
            badgeUrl: crestUrl(c.name),
            colors: c.colors,
          })),
        }))}
      />
    </>
  );
}
