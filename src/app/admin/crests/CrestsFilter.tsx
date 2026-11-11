"use client";
import { useState } from "react";
import { Crest } from "@/components/Crest";

interface ClubView { name: string; town: string; founded: number; badgeUrl: string; colors: [string, string] }
interface LeagueView { name: string; code: string; region: string; badgeUrl: string; colors: [string, string]; clubs: ClubView[] }

export function CrestsFilter({ leagues }: { leagues: LeagueView[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = active ? leagues.filter((l) => l.code === active) : leagues;
  const searched = q
    ? filtered.map((l) => ({ ...l, clubs: l.clubs.filter((c) => c.name.toLowerCase().includes(q) || c.town.toLowerCase().includes(q)) })).filter((l) => l.clubs.length || l.name.toLowerCase().includes(q))
    : filtered;

  return (
    <div className="space-y-5">
      {/* League filter chips */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActive(null)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${!active ? "bg-lime text-black" : "bg-ink-600 text-fog hover:bg-ink-500"}`}>
          All
        </button>
        {leagues.map((l) => (
          <button key={l.code} onClick={() => setActive(active === l.code ? null : l.code)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${active === l.code ? "bg-lime text-black" : "bg-ink-600 text-fog hover:bg-ink-500"}`}>
            {l.code}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search clubs or towns..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-line bg-ink-700 px-3 py-2 text-sm text-white placeholder:text-fog/50 focus:border-lime focus:outline-none sm:max-w-xs"
      />

      {/* Leagues and clubs */}
      {searched.map((league) => (
        <section key={league.code} className="rounded-2xl border border-line bg-ink-700 shadow-card overflow-hidden">
          {/* League header */}
          <div className="flex items-center gap-3 border-b border-line px-4 py-3" style={{ background: `linear-gradient(135deg, ${league.colors[0]}22, ${league.colors[1]}22)` }}>
            <Crest name={league.name} src={league.badgeUrl} size="md" />
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-white truncate">{league.name}</h2>
              <p className="text-xs text-fog">{league.region} &middot; {league.clubs.length} clubs</p>
            </div>
          </div>

          {/* Club grid */}
          <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {league.clubs.map((club) => (
              <div key={club.name} className="flex flex-col items-center gap-2 bg-ink-700 px-3 py-4">
                <Crest name={club.name} src={club.badgeUrl} size="lg" />
                <div className="text-center">
                  <p className="text-xs font-bold text-white leading-tight">{club.name}</p>
                  <p className="text-[10px] text-fog">{club.town} &middot; Est. {club.founded}</p>
                </div>
                <div className="flex gap-1">
                  <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: club.colors[0] }} />
                  <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: club.colors[1] }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {searched.length === 0 && (
        <p className="py-12 text-center text-sm text-fog">No clubs match &ldquo;{search}&rdquo;</p>
      )}
    </div>
  );
}
