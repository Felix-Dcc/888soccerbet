import Link from "next/link";
import { BallOrbit } from "@/components/BallOrbit";
import { competitionRank, listFixtures } from "@/lib/queries";
import { MatchTable } from "@/components/MatchTable";
import { PageHero } from "@/components/PageHero";
import { photos } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const fixtures = await listFixtures({ live: true });
  const rankOf = Object.fromEntries(fixtures.map((f) => [f.competition, competitionRank(f.competition)]));
  return (
    <div className="space-y-5">
      <PageHero
        photo={photos.footballStadiumWide}
        position="center 62%"
        title={
          <span className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-danger" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
            </span>
            Live
          </span>
        }
      >
        <span className="rounded-md bg-black/50 px-2 text-sm font-semibold tabular-nums text-white backdrop-blur">{fixtures.length}</span>
      </PageHero>
      {fixtures.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
          <BallOrbit className="h-24 w-24" />
          <div className="font-display text-lg font-bold text-white">Nothing live right now</div>
          <Link href="/" className="btn-ghost px-4 py-2 text-sm">
            Upcoming matches
          </Link>
        </div>
      ) : (
        <MatchTable fixtures={fixtures} rankOf={rankOf} />
      )}
    </div>
  );
}
