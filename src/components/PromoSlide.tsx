import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

/**
 * Banner frame shared by every hero slide, in the usual sportsbook banner layout: the photo
 * fills the left side and ends in a diagonal cut with a brand-green edge; the message sits
 * on the dark right side. The bottom strip stays free for the carousel controls.
 */
export function BannerFrame({
  photo,
  position = "center",
  priority = false,
  watermark,
  children,
}: {
  photo: StaticImageData;
  position?: string;
  priority?: boolean;
  watermark?: string; // huge outlined word behind the copy, matchday-poster style
  children: React.ReactNode;
}) {
  return (
    <div className="theme-dark relative isolate h-full overflow-hidden bg-ink-900">
      {watermark && (
        <span aria-hidden className="pointer-events-none absolute -bottom-3 right-0 -z-10 select-none whitespace-nowrap font-display text-[4.5rem] font-extrabold uppercase italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,.08)] sm:-bottom-5 sm:text-[8.5rem]">
          {watermark}
        </span>
      )}
      <div aria-hidden className="kb-streak pointer-events-none absolute inset-0 z-10" />
      <div className="absolute inset-y-0 left-0 -z-10 w-[52%] bg-[#0F8A3C] [clip-path:polygon(0_0,100%_0,84%_100%,0_100%)]" />
      <div className="absolute inset-y-0 left-0 -z-10 w-[49%] [clip-path:polygon(0_0,100%_0,82%_100%,0_100%)]">
        <Image src={photo} alt="" fill priority={priority} placeholder="blur" sizes="(min-width: 1280px) 450px, 50vw" className="kb-zoom object-cover" style={{ objectPosition: position }} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,11,16,0)_60%,rgba(8,11,16,.35))]" />
      </div>
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(420px_220px_at_78%_40%,rgba(15,138,60,.25),transparent)]" />
      <div className="ml-auto flex h-full w-[56%] flex-col justify-center gap-2 py-4 pb-9 pr-4 sm:gap-3 sm:pr-8">{children}</div>
    </div>
  );
}

/** Headline in the banner style: heavy italic capitals. */
export function BannerTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-lg font-extrabold uppercase italic leading-[1.02] tracking-tight text-white sm:text-3xl">{children}</h2>;
}

export const bannerCtaClass =
  "inline-flex w-fit items-center rounded-full border-2 border-white px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white transition hover:bg-white hover:text-ink-900 sm:px-5 sm:py-1.5 sm:text-xs";

export function BannerCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={bannerCtaClass}>
      {children}
    </Link>
  );
}

/** A hero slide that points at a real feature of the site (never an offer that doesn't exist). */
export function PromoSlide({
  photo,
  position = "center",
  title,
  cta,
  href,
  action,
}: {
  photo: StaticImageData;
  position?: string;
  title: string;
  cta: string;
  href?: string;
  action?: React.ReactNode; // a client control instead of a link (e.g. open the betslip)
}) {
  return (
    <BannerFrame photo={photo} position={position}>
      <div className="kb-enter">
        <BannerTitle>{title}</BannerTitle>
      </div>
      <div className="kb-enter mt-1 [animation-delay:.1s]">{action ?? <BannerCta href={href ?? "/"}>{cta}</BannerCta>}</div>
    </BannerFrame>
  );
}
