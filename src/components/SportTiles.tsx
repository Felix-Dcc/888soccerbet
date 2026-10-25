import Image from "next/image";
import Link from "next/link";
import { sportPhoto } from "@/lib/photos";
import { SportIcon } from "./SportIcon";

/** Photo tiles per sport with live match counts; the active one is outlined. */
export function SportTiles({ sports, active }: { sports: { key: string; name: string; count: number }[]; active?: string }) {
  if (!sports.length) return null;
  return (
    <nav aria-label="Sports" className="grid grid-cols-2 gap-3">
      {sports.map((s) => {
        const on = s.key === active;
        return (
          <Link
            key={s.key}
            href={on ? "/" : `/?sport=${s.key}`}
            aria-current={on ? "page" : undefined}
            className={`theme-dark group relative isolate flex h-24 items-end overflow-hidden rounded-lg border p-3 transition sm:h-28 ${
              on ? "border-lime/70 shadow-glow" : "border-white/[0.08] hover:border-white/20"
            }`}
          >
            <Image src={sportPhoto(s.key)} alt="" fill placeholder="blur" sizes="(min-width: 1024px) 400px, 50vw" className="-z-20 object-cover transition duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(8,11,16,.92),rgba(8,11,16,.35))]" />
            <span className="flex w-full items-center gap-2">
              <span className={`grid h-8 w-8 place-items-center rounded-full ${on ? "bg-lime text-lime-ink" : "bg-black/50 text-white backdrop-blur"}`}>
                <SportIcon sport={s.key} className="h-4 w-4" />
              </span>
              <span className="font-display text-base font-bold text-white">{s.name}</span>
              <span className="ml-auto rounded-md bg-black/50 px-1.5 text-xs font-semibold tabular-nums text-fog backdrop-blur">{s.count}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
