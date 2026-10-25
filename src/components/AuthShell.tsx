import Image from "next/image";
import { photos } from "@/lib/photos";
import { CrownMark, Wordmark } from "./Logo";

/** Split auth layout: licensed pitch photo with the brand on one side, the form on the other. */
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-4xl overflow-hidden rounded-xl border border-white/[0.08] bg-ink-800/80 shadow-lift md:grid-cols-[0.9fr_1.1fr]">
      <div className="theme-dark relative isolate flex min-h-[150px] flex-col justify-end p-6 md:min-h-[560px]">
        <Image src={photos.footballPitchCorner} alt="" fill priority placeholder="blur" sizes="(min-width: 768px) 400px, 100vw" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(8,11,16,.95)_0%,rgba(8,11,16,.45)_55%,rgba(8,11,16,.2)_100%)]" />
        <CrownMark size={44} />
        <p className="mt-3 font-display text-2xl font-extrabold leading-tight text-white md:text-3xl">
          <Wordmark />
        </p>
      </div>
      <div className="p-6 sm:p-8">
        <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-white">{title}</h1>
        {children}
      </div>
    </div>
  );
}
