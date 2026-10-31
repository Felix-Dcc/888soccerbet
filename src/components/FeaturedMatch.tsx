import type { UiFixture } from "@/lib/queries";
import { sportBannerPhoto } from "@/lib/photos";
import { kickoffDay, kickoffTime } from "@/lib/time";
import { Crest } from "./Crest";
import { BannerCta, BannerEyebrow, BannerFrame, BannerTitle } from "./PromoSlide";

/**
 * Match banner for the hero, matchday-poster style: the competition as an accent chip, crests
 * that slide in, "HOME VS AWAY" in heavy italic capitals, the kick-off, and a Bet now button.
 * The photo is a neutral pitch/court — it implies no club, player or sponsor.
 */
export function FeaturedMatch({ f, priority = false }: { f: UiFixture; priority?: boolean }) {
  return (
    <BannerFrame photo={sportBannerPhoto(f.sportKey)} position="center 55%" priority={priority}>
      <div className="kb-enter">
        <BannerEyebrow>{f.competition}</BannerEyebrow>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="kb-enter kb-from-left">
          <Crest name={f.homeTeam} src={f.homeTeamLogo} size="md" />
        </span>
        <span className="kb-enter kb-pop font-display text-xs font-extrabold italic text-lime [animation-delay:.12s] sm:text-sm">VS</span>
        <span className="kb-enter kb-from-right [animation-delay:.06s]">
          <Crest name={f.awayTeam} src={f.awayTeamLogo} size="md" />
        </span>
      </div>

      <div className="kb-enter [animation-delay:.12s]">
        <BannerTitle>
          <span className="line-clamp-2">{f.homeTeam}</span>
          {/* Muted, not the accent: the accent already carries the chip, crest VS and button. */}
          <span className="line-clamp-2">
            <span className="text-white/55">vs</span> {f.awayTeam}
          </span>
        </BannerTitle>
      </div>

      <div className="kb-enter flex min-w-0 items-baseline gap-2 [animation-delay:.2s]">
        <span className="font-display text-lg font-extrabold tabular-nums leading-none text-white sm:text-3xl">{kickoffTime(f.startsAt)}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-lime sm:text-xs">{kickoffDay(f.startsAt)}</span>
      </div>

      <div className="kb-enter mt-1 [animation-delay:.28s]">
        <BannerCta href={`/fixture/${f.id}`}>Bet now</BannerCta>
      </div>
    </BannerFrame>
  );
}
