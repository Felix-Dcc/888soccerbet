/** Skeleton shown inside the console rail while an admin page loads. */
export default function AdminLoading() {
  const bar = "animate-pulse rounded bg-white/[0.05]";
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div className={`${bar} h-7 w-44`} />
        <div className={`${bar} h-9 w-56`} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.07] md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 bg-[#10151C] px-4 py-3">
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} h-5 w-28`} />
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {[8, 5].map((rows, i) => (
          <div key={i} className="space-y-3 rounded-md border border-white/[0.07] bg-[#10151C] p-4">
            <div className={`${bar} h-4 w-32`} />
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className={`${bar} h-4`} style={{ width: `${92 - ((j * 13) % 30)}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
