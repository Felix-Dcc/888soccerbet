import Image, { type StaticImageData } from "next/image";

/** Photographic page banner: title (+ optional count/actions) over a darkened licensed photo. */
export function PageHero({
  title,
  photo,
  position = "center",
  children,
}: {
  title: React.ReactNode;
  photo: StaticImageData;
  position?: string; // object-position, to keep the interesting part of the photo in frame
  children?: React.ReactNode;
}) {
  return (
    <section className="theme-dark relative isolate overflow-hidden rounded-xl border border-white/[0.08] shadow-lift">
      <Image
        src={photo}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="(min-width: 1280px) 900px, 100vw"
        className="-z-20 object-cover"
        style={{ objectPosition: position }}
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(8,11,16,.92)_0%,rgba(8,11,16,.7)_45%,rgba(8,11,16,.35)_100%)]" />
      <div className="flex min-h-[112px] flex-wrap items-center gap-3 px-5 py-6 sm:min-h-[132px] sm:px-7">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
        {children}
      </div>
    </section>
  );
}
