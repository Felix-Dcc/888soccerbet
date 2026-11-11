import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

/**
 * Banner frame shared by every hero slide. The photo runs full width and a scrim darkens the
 * left, so the copy stays legible over any image while the subject still reads on the right.
 * A thin accent rail marks the leading edge. The bottom strip stays free for the carousel
 * controls.
 */
export function BannerFrame({
  photo,
  position = "center",
  priority = false,
  children,
}: {
  photo: StaticImageData;
  position?: string;
  priority?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate h-full overflow-hidden bg-ink-900">
      <Image
        src={photo}
        alt=""
        fill
        priority={priority}
        placeholder="blur"
        sizes="(min-width: 1280px) 900px, 100vw"
        className="kb-zoom -z-20 object-cover"
        style={{ objectPosition: position }}
      />
      {/* Legibility scrim: heavy behind the copy, clear over the subject. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(10,15,12,.94)_0%,rgba(10,15,12,.86)_38%,rgba(10,15,12,.45)_68%,rgba(10,15,12,.15)_100%)]"
      />
      <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-1 bg-lime" />
      <div className="flex h-full w-[72%] flex-col justify-center gap-1.5 py-4 pb-10 pl-5 pr-3 sm:w-[64%] sm:gap-2.5 sm:pl-9">{children}</div>
    </div>
  );
}

/** Small accent chip above the headline, the way a campaign banner is labelled. */
export function BannerEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-lime px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-lime-ink sm:text-[11px]">
      {children}
    </span>
  );
}

/** Headline in the banner style: heavy italic capitals. */
export function BannerTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xl font-extrabold uppercase italic leading-[0.98] tracking-tight text-white sm:text-4xl">{children}</h2>;
}

export const bannerCtaClass =
  "inline-flex w-fit items-center gap-1.5 rounded-full bg-lime px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-lime-ink transition hover:bg-lime-600 active:translate-y-px sm:px-6 sm:py-2 sm:text-xs";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="currentColor" aria-hidden>
      <path d="M8 5l11 7-11 7z" />
    </svg>
  );
}

export function BannerCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={bannerCtaClass}>
      {children}
      <Arrow />
    </Link>
  );
}

/** A hero slide that points at a real feature of the site (never an offer that doesn't exist). */
export function PromoSlide({
  photo,
  position = "center",
  eyebrow,
  title,
  cta,
  href,
  action,
}: {
  photo: StaticImageData;
  position?: string;
  eyebrow?: string;
  title: string;
  cta: string;
  href?: string;
  action?: React.ReactNode; // a client control instead of a link (e.g. open the betslip)
}) {
  return (
    <BannerFrame photo={photo} position={position}>
      {eyebrow && (
        <div className="kb-enter">
          <BannerEyebrow>{eyebrow}</BannerEyebrow>
        </div>
      )}
      <div className="kb-enter [animation-delay:.06s]">
        <BannerTitle>{title}</BannerTitle>
      </div>
      <div className="kb-enter mt-1 [animation-delay:.14s]">{action ?? <BannerCta href={href ?? "/"}>{cta}</BannerCta>}</div>
    </BannerFrame>
  );
}
