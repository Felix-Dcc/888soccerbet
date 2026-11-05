"use client";
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { DATA_CHANGED_EVENT } from "../LiveRefresh";
import type { BonusRules } from "@/lib/bonus";

export interface Pick {
  selectionId: string;
  fixtureId: string;
  milliOdds: number;
  selectionName: string;
  marketName: string;
  fixtureName: string;
}

/** Window event that opens the betslip (drawer on mobile, focus on desktop). */
export const OPEN_SLIP_EVENT = "888soccerbet:open-slip";

interface BetslipState {
  picks: Pick[];
  stake: number;
  minStake: number; // GHS, from the server setting the bet engine enforces
  bonus: BonusRules; // multiple-bonus rates, so the slip can show the bonus before the bet is placed
  open: boolean;
  add: (p: Pick) => void;
  remove: (selectionId: string) => void;
  has: (selectionId: string) => boolean;
  clear: () => void;
  replace: (picks: Pick[]) => void; // load a booked slip
  setStake: (n: number) => void;
  setOpen: (o: boolean) => void;
  notice: string | null; // message about a booking link that could not be loaded
  setNotice: (n: string | null) => void;
}

const Ctx = createContext<BetslipState | null>(null);
const KEY = "sb.betslip.v1";

export function BetslipProvider({ minStake, bonus, children }: { minStake: number; bonus: BonusRules; children: React.ReactNode }) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [stake, setStake] = useState(minStake);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let saved: Pick[] = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.picks)) saved = d.picks;
        if (typeof d.stake === "number") setStake(Math.max(d.stake, minStake)); // a slip saved under an older, lower minimum
      }
    } catch {
      /* ignore */
    }
    setPicks(saved);
    setLoaded(true);
    if (saved.length) void revalidate(saved);
    void loadSharedCode();
  }, []);

  /** A shared booking link (/?booking=CODE) loads that slip at current odds and opens it. */
  async function loadSharedCode() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("booking")?.trim();
    if (!code) return;
    url.searchParams.delete("booking");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(code.slice(0, 20))}`);
      const d = await res.json();
      if (!res.ok) setNotice(d.error ?? "Could not load that booking code");
      else if (!d.picks.length) setNotice("None of these selections are available any more");
      else {
        setPicks(d.picks);
        if (d.unavailable) setNotice(`${d.unavailable} ${d.unavailable === 1 ? "selection is" : "selections are"} no longer available`);
      }
    } catch {
      setNotice("Network error — could not load that booking code");
    }
    window.dispatchEvent(new Event(OPEN_SLIP_EVENT));
  }

  /**
   * A saved slip can outlive its matches (kick-off, settlement, resync). Replace saved legs
   * with their current server state; legs added since the request started are kept as-is.
   */
  async function revalidate(saved: Pick[]) {
    try {
      const res = await fetch("/api/betslip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectionIds: saved.map((p) => p.selectionId) }),
      });
      if (!res.ok) return; // keep the slip; placement re-validates on the server anyway
      const { picks: fresh } = (await res.json()) as { picks: Pick[] };
      const asked = new Set(saved.map((p) => p.selectionId));
      const byId = new Map(fresh.map((p) => [p.selectionId, p]));
      setPicks((cur) => cur.flatMap((p) => (asked.has(p.selectionId) ? (byId.has(p.selectionId) ? [byId.get(p.selectionId)!] : []) : [p])));
    } catch {
      /* offline: keep the slip */
    }
  }

  // Prices or match status changed on the server: refresh the legs on the slip too.
  useEffect(() => {
    const onChange = () => picks.length && void revalidate(picks);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, [picks]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ picks, stake }));
    } catch {
      /* ignore */
    }
  }, [picks, stake, loaded]);

  const add = useCallback((p: Pick) => {
    setPicks((cur) => {
      if (cur.some((x) => x.selectionId === p.selectionId)) return cur.filter((x) => x.selectionId !== p.selectionId);
      // one selection per fixture (correlated legs are rejected server-side too)
      return [...cur.filter((x) => x.fixtureId !== p.fixtureId), p];
    });
  }, []);
  const remove = useCallback((id: string) => setPicks((c) => c.filter((x) => x.selectionId !== id)), []);
  const has = useCallback((id: string) => picks.some((x) => x.selectionId === id), [picks]);
  const clear = useCallback(() => setPicks([]), []);
  const replace = useCallback((next: Pick[]) => setPicks(next), []);

  const value = useMemo<BetslipState>(
    () => ({ picks, stake, minStake, bonus, open, add, remove, has, clear, replace, setStake, setOpen, notice, setNotice }),
    [picks, stake, minStake, bonus, open, add, remove, has, clear, replace, notice],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBetslip() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBetslip outside provider");
  return c;
}
