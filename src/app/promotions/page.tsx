import Image from "next/image";
import { photos } from "@/lib/photos";
import { PageHero } from "@/components/PageHero";
import { getCurrentUser } from "@/lib/session";
import { playerCurrency } from "@/lib/wallet";
import { localizeMessage } from "@/lib/currency";

export const dynamic = "force-dynamic"; // amounts follow the player's currency (Naira for Nigerians)

// None of these is implemented in the bonus engine yet, so each is shown as "Coming soon"
// with no claim action. Flip `live` only once the offer is actually wired and funded.
const PROMOS = [
  { name: "Welcome match", value: "100% up to GHS 500", terms: "Double your first deposit. 3× turnover at odds of 1.50+, 14 days to use it.", photo: photos.footballStadiumLights, live: false },
  { name: "Acca boost", value: "Up to +40%", terms: "Five or more legs on one slip earns a boost on the total odds, applied automatically.", photo: photos.basketballRimSmoke, live: false },
  { name: "Free bet Friday", value: "GHS 20 weekly", terms: "Stake GHS 100 across the week and collect a free bet every Friday.", photo: photos.footballStadiumBlue, live: false },
  { name: "Early payout", value: "Winner paid early", terms: "If your team goes two goals clear, your single on them is paid out — win or lose after.", photo: photos.footballBallNight, live: false },
];

export default async function PromotionsPage() {
  const currency = await playerCurrency(await getCurrentUser().catch(() => null));
  return (
    <div className="space-y-6">
      <PageHero title="Promotions" photo={photos.basketballRimSmoke} position="center 40%" />
      <div className="grid gap-4 sm:grid-cols-2">
        {PROMOS.map((p) => (
          <article key={p.name} className="card card-hover overflow-hidden">
            <div className="theme-dark relative isolate h-36">
              <Image src={p.photo} alt="" fill placeholder="blur" sizes="(min-width: 640px) 450px, 100vw" className="-z-20 object-cover" />
              <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,#0C1421_0%,rgba(12,20,33,.2)_100%)]" />
              <span className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${p.live ? "bg-lime text-lime-ink" : "bg-black/60 text-snow/80 backdrop-blur"}`}>
                {p.live ? "Active" : "Coming soon"}
              </span>
            </div>
            <div className="relative -mt-6 p-5 pt-0">{/* relative: must paint above the positioned photo it overlaps */}
              <h2 className="text-xs font-bold uppercase tracking-wider text-lime">{p.name}</h2>
              <p className="mt-1.5 font-display text-2xl font-extrabold text-white">{localizeMessage(currency, p.value)}</p>
              <p className="mt-1.5 text-sm text-fog">{localizeMessage(currency, p.terms)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
