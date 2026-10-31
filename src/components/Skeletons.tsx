/** Loading placeholders shaped like the real components, so the layout doesn't jump when data arrives. */
export function HeroSkeleton() {
  return (
    <div className="card overflow-hidden p-6" aria-hidden>
      <div className="skeleton h-4 w-40" />
      <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="skeleton h-20 w-20 rounded-full" />
          <div className="skeleton h-4 w-24" />
        </div>
        <div className="skeleton h-10 w-20" />
        <div className="flex flex-col items-center gap-3">
          <div className="skeleton h-20 w-20 rounded-full" />
          <div className="skeleton h-4 w-24" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ groups = 2, rows = 4 }: { groups?: number; rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: groups }, (_, g) => (
        <div key={g} className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-3 py-3">
            <div className="skeleton h-7 w-7 rounded-full" />
            <div className="skeleton h-4 w-40" />
          </div>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex items-center gap-3 border-b border-line px-3 py-3 last:border-0">
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-36" />
                <div className="skeleton h-3.5 w-28" />
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-11 w-[3.25rem] sm:w-16" />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Dark ticket placeholder while a ticket (or a verification lookup) loads. */
export function TicketSkeleton() {
  return (
    <div role="status" aria-label="Loading ticket" className="theme-dark mx-auto max-w-2xl overflow-hidden rounded-2xl bg-[#14171C] ring-1 ring-white/[0.06]">
      <div className="space-y-4 p-4 sm:p-6" aria-hidden>
        <div className="flex justify-between">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-3 w-24" />
        </div>
        <div className="flex justify-between">
          <div className="skeleton h-6 w-24" />
          <div className="skeleton h-6 w-16" />
        </div>
        <div className="skeleton ml-auto h-8 w-40" />
        <div className="space-y-2 border-t border-white/[0.08] pt-4">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-full" />
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-3 border-t border-white/[0.06] p-4" aria-hidden>
          <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-4 w-48" />
            <div className="skeleton h-20 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
