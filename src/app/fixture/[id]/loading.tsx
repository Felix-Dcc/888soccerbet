import { HeroSkeleton } from "@/components/Skeletons";

/** Shown the instant a match is tapped (prefetched with the link), while its odds load. */
export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading match">
      <div className="skeleton h-4 w-44" />
      <HeroSkeleton />
      <div className="card space-y-5 p-4" aria-hidden>
        {[3, 3, 3].map((cols, i) => (
          <div key={i} className="space-y-2.5">
            <div className="skeleton h-4 w-32" />
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: cols }, (_, j) => (
                <div key={j} className="skeleton h-11 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
